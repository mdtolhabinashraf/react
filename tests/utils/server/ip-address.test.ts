import { describe, expect, it } from "vitest";
import {
  getClientIp,
  sanitizeIp,
} from "../../../src/utils/server/ip-address.js";

describe("sanitizeIp", () => {
  describe("IPv4", () => {
    it.each([
      "192.168.1.1",
      "127.0.0.1",
      "8.8.8.8",
      "255.255.255.255",
      "0.0.0.0",
      "10.0.0.1",
    ])("accepts valid IPv4 address: %s", (ip) => {
      expect(sanitizeIp(ip)).toBe(ip);
    });

    it.each([
      "256.1.1.1",
      "192.168.1.256",
      "192.168.1",
      "192.168.1.1.1",
      "192.168.1.-1",
      "abc.def.ghi.jkl",
      "192.168.1.1 ",
    ])("rejects invalid IPv4 address: %s", (ip) => {
      expect(sanitizeIp(ip)).toBeNull();
    });
  });

  describe("IPv6", () => {
    it.each([
      "::1",
      "::",
      "2001:db8::1",
      "2001:4860:4860::8888",
      "fe80::1",
      "2001:db8:0:0:0:0:0:1",
      "::ffff:192.168.1.1",
    ])("accepts valid IPv6 address: %s", (ip) => {
      expect(sanitizeIp(ip)).toBe(ip);
    });

    it.each([
      "2001:db8:::1",
      "gggg::1",
      "2001:db8:0:0:0:0:0:0:1",
      "12345::1",
      "not-an-ip",
    ])("rejects invalid IPv6 address: %s", (ip) => {
      expect(sanitizeIp(ip)).toBeNull();
    });
  });

  describe("empty and missing values", () => {
    it("returns null for an empty string", () => {
      expect(sanitizeIp("")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(sanitizeIp(undefined)).toBeNull();
    });
  });
});

describe("getClientIp", () => {
  function createRequest(headers: Record<string, string> = {}): Request {
    return new Request("https://example.com", { headers });
  }

  describe("proxy headers", () => {
    it("reads CF-Connecting-IP", () => {
      const request = createRequest({
        "CF-Connecting-IP": "203.0.113.10",
      });

      expect(getClientIp(request)).toBe("203.0.113.10");
    });

    it("reads the first IP from X-Forwarded-For", () => {
      const request = createRequest({
        "X-Forwarded-For": "203.0.113.10, 10.0.0.1, 10.0.0.2",
      });

      expect(getClientIp(request)).toBe("203.0.113.10");
    });

    it("reads X-Real-IP when other supported headers are absent", () => {
      const request = createRequest({
        "X-Real-IP": "198.51.100.20",
      });

      expect(getClientIp(request)).toBe("198.51.100.20");
    });

    it("prioritizes CF-Connecting-IP over other proxy headers", () => {
      const request = createRequest({
        "CF-Connecting-IP": "203.0.113.10",
        "X-Forwarded-For": "198.51.100.20",
        "X-Real-IP": "192.0.2.30",
      });

      expect(getClientIp(request)).toBe("203.0.113.10");
    });

    it("falls back to X-Real-IP if X-Forwarded-For is invalid", () => {
      const request = createRequest({
        "X-Forwarded-For": "invalid-ip, 203.0.113.10",
        "X-Real-IP": "198.51.100.20",
      });

      // The implementation currently returns the first valid
      // header's result only when that value passes validation.
      // An invalid higher-priority value falls through.
      expect(getClientIp(request)).toBe("198.51.100.20");
    });
  });

  describe("Forwarded header", () => {
    it("extracts an IPv4 address from Forwarded", () => {
      const request = createRequest({
        Forwarded: 'for="203.0.113.10";proto=https;by=203.0.113.1',
      });

      expect(getClientIp(request)).toBe("203.0.113.10");
    });

    it("extracts an IPv6 address from Forwarded", () => {
      const request = createRequest({
        Forwarded: "for=2001:db8::1;proto=https",
      });

      // This test exposes a limitation of the current regex:
      // unquoted IPv6 Forwarded values can be truncated.
      expect(getClientIp(request)).toBe("2001:db8::1");
    });

    it("returns the default fallback for an invalid Forwarded value", () => {
      const request = createRequest({
        Forwarded: "for=invalid-ip",
      });

      expect(getClientIp(request)).toBe("0.0.0.0");
    });
  });

  describe("fallback behavior", () => {
    it("returns 0.0.0.0 when no IP information is available", () => {
      expect(getClientIp(createRequest())).toBe("0.0.0.0");
    });

    it("returns 0.0.0.0 when all available IP headers are invalid", () => {
      const request = createRequest({
        "CF-Connecting-IP": "invalid",
        "X-Forwarded-For": "999.999.999.999",
        "X-Real-IP": "not-an-ip",
      });

      expect(getClientIp(request)).toBe("0.0.0.0");
    });
  });
});
