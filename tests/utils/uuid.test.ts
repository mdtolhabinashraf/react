import { afterEach, describe, expect, it, vi } from "vitest";
import { UUID } from "../../src/utils/uuid";

describe("UUID", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("random()", () => {
    it("generates a valid UUID v4 by default", () => {
      const uuid = UUID.random();

      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("generates an uppercase UUID when requested", () => {
      const uuid = UUID.random(false, true);

      expect(uuid).toBe(uuid.toUpperCase());
      expect(UUID.validate(uuid)).toBe(true);
    });

    it("generates a timestamp-prefixed value when timestamp is enabled", () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const uuid = UUID.random(true);

      expect(uuid.slice(0, 8)).toBe(
        Math.floor(now.getTime() / 1000).toString(16),
      );
      expect(uuid).toMatch(/^[0-9a-f-]+$/);
    });

    it("returns an uppercase timestamp-prefixed value when requested", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const uuid = UUID.random(true, true);

      expect(uuid).toBe(uuid.toUpperCase());
    });

    it("generates different UUIDs across calls", () => {
      const first = UUID.random();
      const second = UUID.random();

      expect(first).not.toBe(second);
    });
  });

  describe("getTime()", () => {
    it("extracts the timestamp from a timestamp-prefixed UUID", () => {
      const seconds = Math.floor(
        new Date("2026-01-01T00:00:00.000Z").getTime() / 1000,
      );
      const timestampHex = seconds.toString(16);
      const uuid = `${timestampHex}-1234-5678-9abc-def012345678`;

      expect(UUID.getTime(uuid)).toEqual(new Date(seconds * 1000));
    });

    it("supports uppercase hexadecimal timestamps", () => {
      const seconds = Math.floor(
        new Date("2026-01-01T00:00:00.000Z").getTime() / 1000,
      );
      const uuid = `${seconds.toString(16).toUpperCase()}-1234-5678-9abc-def012345678`;

      expect(UUID.getTime(uuid)).toEqual(new Date(seconds * 1000));
    });

    it("returns null for an empty string", () => {
      expect(UUID.getTime("")).toBeNull();
    });

    it("returns null when the string does not start with hexadecimal characters", () => {
      expect(UUID.getTime("not-a-uuid")).toBeNull();
    });

    it("returns an epoch-based date for a short hexadecimal prefix", () => {
      expect(UUID.getTime("abc")).toEqual(
        new Date(Number.parseInt("abc", 16) * 1000),
      );
    });

    it("returns a Date for a standard UUID string", () => {
      const result = UUID.getTime("550e8400-e29b-41d4-a716-446655440000");

      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(Number.parseInt("550e8400", 16) * 1000);
    });
  });

  describe("validate()", () => {
    it("accepts a valid UUID v4", () => {
      expect(UUID.validate("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("accepts uppercase UUID strings", () => {
      expect(UUID.validate("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    });

    it("rejects an empty string", () => {
      expect(UUID.validate("")).toBe(false);
    });

    it.each([
      "not-a-uuid",
      "550e8400e29b41d4a716446655440000",
      "550e8400-e29b-41d4-a716-44665544000",
      "550e8400-e29b-41d4-a716-4466554400000",
      "550e8400-e29b-41d4-a716-44665544000g",
      "550e8400-e29b-41d4-a716",
    ])("rejects malformed UUID: %s", (uuid) => {
      expect(UUID.validate(uuid)).toBe(false);
    });

    it("accepts a UUID without an expiration argument", () => {
      expect(UUID.validate("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("accepts a UUID when the expiration date is in the future", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const uuid = UUID.random(true);
      const expires = new Date("2027-01-01T00:00:00.000Z");

      expect(UUID.validate(uuid, expires)).toBe(true);
    });

    it("rejects a UUID when the expiration date is in the past", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const uuid = UUID.random(true);
      const expires = new Date("2025-01-01T00:00:00.000Z");

      expect(UUID.validate(uuid, expires)).toBe(false);
    });

    it("supports a numeric expiration duration in milliseconds", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const uuid = UUID.random(true);

      expect(UUID.validate(uuid, 60_000)).toBe(true);
    });

    it("rejects a timestamp-prefixed value when its timestamp exceeds the expiration date", () => {
      const futureSeconds = Math.floor(
        new Date("2030-01-01T00:00:00.000Z").getTime() / 1000,
      );
      const uuid = `${futureSeconds.toString(16)}-1234-5678-9abc-def012345678`;

      expect(UUID.validate(uuid, new Date("2029-01-01T00:00:00.000Z"))).toBe(
        false,
      );
    });
  });
});
