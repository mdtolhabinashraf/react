import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  MemoryRateLimitStore,
  type RateLimitStore,
  type RateLimitStoreResult,
} from "../../../src/utils/server/rate-limiter";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3;
const INITIAL_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();

/**
 * Creates a rate limiter with predictable default configuration.
 */
function createTestLimiter(
  overrides: Partial<{
    windowMs: number;
    maxRequests: number;
    namespace: string;
    cleanupIntervalMs: number;
  }> = {},
  store?: RateLimitStore,
) {
  return createRateLimiter(
    {
      windowMs: WINDOW_MS,
      maxRequests: MAX_REQUESTS,
      ...overrides,
    },
    store,
  );
}

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INITIAL_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("configuration", () => {
    it("creates a limiter with valid configuration", async () => {
      const limiter = createTestLimiter();

      await expect(limiter.check("user-1")).resolves.toMatchObject({
        limited: false,
        limit: MAX_REQUESTS,
        remaining: MAX_REQUESTS - 1,
        resetAt: INITIAL_TIME + WINDOW_MS,
        retryAfterMs: 0,
      });
    });

    it.each([
      ["windowMs", { windowMs: 0 }],
      ["windowMs", { windowMs: -1 }],
      ["windowMs", { windowMs: 1.5 }],
      ["windowMs", { windowMs: Number.MAX_SAFE_INTEGER + 1 }],
      ["maxRequests", { maxRequests: 0 }],
      ["maxRequests", { maxRequests: -1 }],
      ["maxRequests", { maxRequests: 1.5 }],
      ["cleanupIntervalMs", { cleanupIntervalMs: 0 }],
      ["cleanupIntervalMs", { cleanupIntervalMs: -1 }],
    ])("rejects invalid %s configuration", (_name, config) => {
      expect(() => createTestLimiter(config)).toThrow(TypeError);
    });

    it.each(["", " ", "\t"])(
      "rejects an empty default namespace: %j",
      (namespace) => {
        expect(() => createTestLimiter({ namespace })).toThrow(TypeError);
      },
    );

    it("uses the default namespace when none is configured", async () => {
      const limiter = createTestLimiter();

      await expect(limiter.check("user-1")).resolves.toMatchObject({
        limited: false,
      });
    });
  });

  describe("request counting", () => {
    it("allows requests up to the configured limit", async () => {
      const limiter = createTestLimiter({ maxRequests: 3 });

      const first = await limiter.check("user-1");
      const second = await limiter.check("user-1");
      const third = await limiter.check("user-1");

      expect(first).toMatchObject({
        limited: false,
        limit: 3,
        remaining: 2,
        retryAfterMs: 0,
      });

      expect(second).toMatchObject({
        limited: false,
        limit: 3,
        remaining: 1,
        retryAfterMs: 0,
      });

      expect(third).toMatchObject({
        limited: false,
        limit: 3,
        remaining: 0,
        retryAfterMs: 0,
      });
    });

    it("rejects requests beyond the configured limit", async () => {
      const limiter = createTestLimiter({ maxRequests: 2 });

      await limiter.check("user-1");
      await limiter.check("user-1");

      const result = await limiter.check("user-1");

      expect(result).toEqual({
        limited: true,
        limit: 2,
        remaining: 0,
        resetAt: INITIAL_TIME + WINDOW_MS,
        retryAfterMs: WINDOW_MS,
      });
    });

    it("does not increase the counter for rejected requests", async () => {
      const limiter = createTestLimiter({ maxRequests: 1 });

      await limiter.check("user-1");

      const second = await limiter.check("user-1");
      const third = await limiter.check("user-1");

      expect(second.limited).toBe(true);
      expect(third.limited).toBe(true);
      expect(third.remaining).toBe(0);
    });

    it("tracks different identifiers independently", async () => {
      const limiter = createTestLimiter({ maxRequests: 1 });

      const first = await limiter.check("user-1");
      const second = await limiter.check("user-2");
      const third = await limiter.check("user-1");

      expect(first.limited).toBe(false);
      expect(second.limited).toBe(false);
      expect(third.limited).toBe(true);
    });
  });

  describe("window expiration", () => {
    it("resets the counter after the window expires", async () => {
      const limiter = createTestLimiter({
        windowMs: 1_000,
        maxRequests: 1,
      });

      const first = await limiter.check("user-1");

      expect(first.limited).toBe(false);

      const blocked = await limiter.check("user-1");

      expect(blocked.limited).toBe(true);
      expect(blocked.retryAfterMs).toBe(1_000);

      await vi.advanceTimersByTimeAsync(1_000);

      const afterReset = await limiter.check("user-1");

      expect(afterReset).toMatchObject({
        limited: false,
        limit: 1,
        remaining: 0,
        resetAt: INITIAL_TIME + 2_000,
        retryAfterMs: 0,
      });
    });

    it("keeps the original expiration time within a window", async () => {
      const limiter = createTestLimiter({
        windowMs: 10_000,
        maxRequests: 3,
      });

      const first = await limiter.check("user-1");

      await vi.advanceTimersByTimeAsync(3_000);

      const second = await limiter.check("user-1");

      expect(second.resetAt).toBe(first.resetAt);
      expect(second.remaining).toBe(1);
    });

    it("reports the remaining retry time accurately", async () => {
      const limiter = createTestLimiter({
        windowMs: 5_000,
        maxRequests: 1,
      });

      await limiter.check("user-1");

      await vi.advanceTimersByTimeAsync(2_000);

      const result = await limiter.check("user-1");

      expect(result.limited).toBe(true);
      expect(result.retryAfterMs).toBe(3_000);
    });
  });

  describe("namespaces", () => {
    it("isolates different namespaces", async () => {
      const limiter = createTestLimiter({ maxRequests: 1 });

      const login = await limiter.check("user-1", {
        namespace: "login",
      });

      const registration = await limiter.check("user-1", {
        namespace: "registration",
      });

      const repeatedLogin = await limiter.check("user-1", {
        namespace: "login",
      });

      expect(login.limited).toBe(false);
      expect(registration.limited).toBe(false);
      expect(repeatedLogin.limited).toBe(true);
    });

    it("allows a per-check namespace to override the default", async () => {
      const limiter = createTestLimiter({
        namespace: "default",
        maxRequests: 1,
      });

      await limiter.check("user-1");

      const overridden = await limiter.check("user-1", {
        namespace: "special",
      });

      const defaultAgain = await limiter.check("user-1");

      expect(overridden.limited).toBe(false);
      expect(defaultAgain.limited).toBe(true);
    });

    it.each(["", " ", "\t"])(
      "rejects an invalid per-check namespace: %j",
      async (namespace) => {
        const limiter = createTestLimiter();

        await expect(limiter.check("user-1", { namespace })).rejects.toThrow(
          TypeError,
        );
      },
    );
  });

  describe("identifier validation", () => {
    it.each(["", " ", "\t"])(
      "rejects an empty identifier: %j",
      async (identifier) => {
        const limiter = createTestLimiter();

        await expect(limiter.check(identifier)).rejects.toThrow(TypeError);
      },
    );

    it("does not reject identifiers containing valid special characters", async () => {
      const limiter = createTestLimiter();

      await expect(
        limiter.check("user@example.com:account/123"),
      ).resolves.toMatchObject({
        limited: false,
      });
    });
  });

  describe("custom storage", () => {
    it("uses the supplied storage implementation", async () => {
      const store: RateLimitStore = {
        consume: vi.fn(
          (_key, options): RateLimitStoreResult => ({
            count: 1,
            resetAt: options.now + options.windowMs,
            allowed: true,
          }),
        ),
      };

      const limiter = createTestLimiter({}, store);

      const result = await limiter.check("user-1");

      expect(store.consume).toHaveBeenCalledOnce();
      expect(store.consume).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent("user-1")),
        {
          windowMs: WINDOW_MS,
          maxRequests: MAX_REQUESTS,
          now: INITIAL_TIME,
        },
      );

      expect(result.limited).toBe(false);
    });

    it("supports asynchronous storage implementations", async () => {
      const store: RateLimitStore = {
        consume: vi.fn(async (_key, options) => ({
          count: 2,
          resetAt: options.now + options.windowMs,
          allowed: true,
        })),
      };

      const limiter = createTestLimiter({}, store);

      await expect(limiter.check("user-1")).resolves.toMatchObject({
        limited: false,
        remaining: MAX_REQUESTS - 2,
      });
    });

    it("propagates storage errors", async () => {
      const store: RateLimitStore = {
        consume: vi.fn().mockRejectedValue(new Error("Storage unavailable")),
      };

      const limiter = createTestLimiter({}, store);

      await expect(limiter.check("user-1")).rejects.toThrow(
        "Storage unavailable",
      );
    });

    it("rejects a store result with an invalid counter", async () => {
      const store: RateLimitStore = {
        consume: vi.fn().mockResolvedValue({
          count: 0,
          resetAt: INITIAL_TIME + WINDOW_MS,
          allowed: true,
        }),
      };

      const limiter = createTestLimiter({}, store);

      await expect(limiter.check("user-1")).rejects.toThrow(
        "Rate-limit store returned an invalid result.",
      );
    });

    it("rejects a store result with an invalid expiration", async () => {
      const store: RateLimitStore = {
        consume: vi.fn().mockResolvedValue({
          count: 1,
          resetAt: INITIAL_TIME,
          allowed: true,
        }),
      };

      const limiter = createTestLimiter({}, store);

      await expect(limiter.check("user-1")).rejects.toThrow(
        "Rate-limit store returned an invalid result.",
      );
    });

    it("rejects a store result without an allowed flag", async () => {
      const store: RateLimitStore = {
        consume: vi.fn().mockResolvedValue({
          count: 1,
          resetAt: INITIAL_TIME + WINDOW_MS,
        }),
      };

      const limiter = createTestLimiter({}, store);

      await expect(limiter.check("user-1")).rejects.toThrow(
        "Rate-limit store returned an invalid result.",
      );
    });
  });
});

describe("MemoryRateLimitStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INITIAL_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and increments subsequent requests", () => {
    const store = new MemoryRateLimitStore();

    const first = store.consume("bucket", {
      windowMs: 10_000,
      maxRequests: 2,
      now: INITIAL_TIME,
    });

    const second = store.consume("bucket", {
      windowMs: 10_000,
      maxRequests: 2,
      now: INITIAL_TIME,
    });

    expect(first).toEqual({
      count: 1,
      resetAt: INITIAL_TIME + 10_000,
      allowed: true,
    });

    expect(second).toEqual({
      count: 2,
      resetAt: INITIAL_TIME + 10_000,
      allowed: true,
    });
  });

  it("rejects requests after reaching the maximum", () => {
    const store = new MemoryRateLimitStore();

    const options = {
      windowMs: 10_000,
      maxRequests: 1,
      now: INITIAL_TIME,
    };

    store.consume("bucket", options);

    expect(store.consume("bucket", options)).toEqual({
      count: 1,
      resetAt: INITIAL_TIME + 10_000,
      allowed: false,
    });
  });

  it("resets an expired bucket", () => {
    const store = new MemoryRateLimitStore();

    store.consume("bucket", {
      windowMs: 1_000,
      maxRequests: 1,
      now: INITIAL_TIME,
    });

    const result = store.consume("bucket", {
      windowMs: 1_000,
      maxRequests: 1,
      now: INITIAL_TIME + 1_000,
    });

    expect(result).toEqual({
      count: 1,
      resetAt: INITIAL_TIME + 2_000,
      allowed: true,
    });
  });

  it("rejects an invalid cleanup interval", () => {
    expect(() => new MemoryRateLimitStore(0)).toThrow(TypeError);
  });
});
