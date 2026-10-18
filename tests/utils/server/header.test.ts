import { describe, expect, it, vi } from "vitest";
import { getHeader } from "../../../src/utils/server/header.js";

describe("getHeader", () => {
  describe("Fetch API Headers", () => {
    it("returns the value of an existing header", () => {
      const req = new Request("https://example.com", {
        headers: {
          Authorization: "Bearer token",
        },
      });

      expect(getHeader(req, "Authorization")).toBe("Bearer token");
    });

    it("performs case-insensitive header lookups", () => {
      const req = new Request("https://example.com", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(getHeader(req, "content-type")).toBe("application/json");
      expect(getHeader(req, "CONTENT-TYPE")).toBe("application/json");
    });

    it("returns null when the header does not exist", () => {
      const req = new Request("https://example.com");

      expect(getHeader(req, "Authorization")).toBeNull();
    });

    it("returns an empty string for an existing empty header", () => {
      const req = new Request("https://example.com", {
        headers: {
          "X-Custom-Header": "",
        },
      });

      expect(getHeader(req, "X-Custom-Header")).toBe("");
    });
  });

  describe("Headers-like objects", () => {
    it("uses the get() method when available", () => {
      const req = {
        headers: {
          get: vi.fn((name: string) =>
            name.toLowerCase() === "authorization" ? "Bearer token" : null,
          ),
        },
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBe("Bearer token");
      expect(req.headers.get).toHaveBeenCalledWith("Authorization");
    });

    it("returns null when get() returns null", () => {
      const req = {
        headers: {
          get: vi.fn(() => null),
        },
      } as unknown as Request;

      expect(getHeader(req, "X-Missing")).toBeNull();
    });

    it("normalizes a non-string result from get()", () => {
      const req = {
        headers: {
          get: vi.fn(() => 123),
        },
      } as unknown as Request;

      expect(getHeader(req, "X-Number")).toBe("123");
    });
  });

  describe("Node.js and Next.js-style headers", () => {
    it("reads a lowercase header key", () => {
      const req = {
        headers: {
          authorization: "Bearer token",
        },
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBe("Bearer token");
    });

    it("falls back to the original header name", () => {
      const req = {
        headers: {
          Authorization: "Bearer token",
        },
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBe("Bearer token");
    });

    it("joins array values with comma and space", () => {
      const req = {
        headers: {
          "x-forwarded-for": ["192.0.2.1", "198.51.100.2"],
        },
      } as unknown as Request;

      expect(getHeader(req, "x-forwarded-for")).toBe("192.0.2.1, 198.51.100.2");
    });

    it("returns an empty string for an empty string value", () => {
      const req = {
        headers: {
          "x-custom-header": "",
        },
      } as unknown as Request;

      expect(getHeader(req, "x-custom-header")).toBe("");
    });

    it("converts other non-null values to strings", () => {
      const req = {
        headers: {
          "x-custom-header": 123,
        },
      } as unknown as Request;

      expect(getHeader(req, "x-custom-header")).toBe("123");
    });

    it("returns null when the header value is undefined", () => {
      const req = {
        headers: {
          "x-custom-header": undefined,
        },
      } as unknown as Request;

      expect(getHeader(req, "x-custom-header")).toBeNull();
    });
  });

  describe("Missing or invalid headers", () => {
    it("returns null when headers is missing", () => {
      const req = {} as Request;

      expect(getHeader(req, "Authorization")).toBeNull();
    });

    it("returns null when headers is undefined", () => {
      const req = {
        headers: undefined,
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBeNull();
    });

    it("returns null when headers is null", () => {
      const req = {
        headers: null,
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBeNull();
    });

    it("returns null when headers is an empty object", () => {
      const req = {
        headers: {},
      } as unknown as Request;

      expect(getHeader(req, "Authorization")).toBeNull();
    });
  });
});
