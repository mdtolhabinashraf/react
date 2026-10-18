/**
 * @packageDocumentation
 *
 * A configurable rate-limiting utility with pluggable storage.
 *
 * The default implementation uses in-memory storage, making it suitable
 * for development, testing, and single-process applications.
 *
 * For distributed or serverless deployments, provide a shared store
 * implementing {@link RateLimitStore}, such as a Redis-backed store.
 */

/**
 * Configuration for creating a rate limiter.
 */
export type RateLimitConfig = {
  /**
   * Duration of each rate-limit window, in milliseconds.
   *
   * The window starts when an identifier makes its first request.
   *
   * @example
   * ```ts
   * windowMs: 60_000 // One minute
   * ```
   */
  windowMs: number;

  /**
   * Maximum number of requests allowed per identifier within a window.
   *
   * @example
   * ```ts
   * maxRequests: 100
   * ```
   */
  maxRequests: number;

  /**
   * Default namespace used to isolate independent rate limits.
   *
   * Use separate namespaces for login, registration, and other operations.
   *
   * @default "default"
   */
  namespace?: string;

  /**
   * Interval between cleanup passes for the in-memory store, in milliseconds.
   *
   * This option only applies when the default memory store is used.
   *
   * @default 60_000
   */
  cleanupIntervalMs?: number;
};

/**
 * Options supplied to a storage implementation when consuming a request.
 */
export type RateLimitStoreOptions = {
  /** Rate-limit window duration, in milliseconds. */
  windowMs: number;

  /** Maximum number of allowed requests per window. */
  maxRequests: number;

  /** Current application timestamp, in milliseconds. */
  now: number;
};

/**
 * Result returned by a rate-limit storage implementation.
 */
export type RateLimitStoreResult = {
  /**
   * Total request count in the current window.
   *
   * The count must not exceed `maxRequests`.
   */
  count: number;

  /** Timestamp when the current window expires, in milliseconds. */
  resetAt: number;

  /**
   * Whether the current request was accepted.
   *
   * This must be determined atomically by the store.
   */
  allowed: boolean;
};

/**
 * Contract for rate-limit storage implementations.
 *
 * Implementations must update counters atomically. This is particularly
 * important when multiple requests or application instances share a store.
 *
 * A distributed implementation should use an atomic operation, such as
 * a Redis Lua script, rather than separate read and write commands.
 */
export interface RateLimitStore {
  /**
   * Attempts to consume one request from the specified rate-limit bucket.
   *
   * @param key - Unique key identifying the rate-limit bucket.
   * @param options - Window and request-limit configuration.
   * @returns Counter state and whether the current request was accepted.
   */
  consume(
    key: string,
    options: RateLimitStoreOptions,
  ): RateLimitStoreResult | Promise<RateLimitStoreResult>;
}

/**
 * Result of checking a request against a rate limit.
 */
export type RateLimitResult = {
  /** Whether the current request was rejected by the rate limiter. */
  limited: boolean;

  /** Maximum number of requests permitted during the current window. */
  limit: number;

  /** Number of additional requests available in the current window. */
  remaining: number;

  /** Window expiration timestamp, in milliseconds since the Unix epoch. */
  resetAt: number;

  /**
   * Time until the window expires, in milliseconds.
   *
   * This is zero when the request is allowed.
   */
  retryAfterMs: number;
};

/**
 * Options for an individual rate-limit check.
 */
export type RateLimitCheckOptions = {
  /**
   * Overrides the limiter's default namespace for this check.
   *
   * @remarks
   * Use a consistent namespace for requests that should share a limit.
   */
  namespace?: string;
};

/**
 * Public API exposed by a configured rate limiter.
 */
export type RateLimiter = {
  /**
   * Checks whether a request from an identifier is allowed.
   *
   * @param identifier - Stable identifier for the client, user, or resource.
   * @param options - Optional per-check configuration.
   * @returns The current rate-limit state.
   *
   * @throws {TypeError} If the identifier or namespace is invalid.
   * @throws {Error} If the storage implementation returns an invalid result.
   */
  check(
    identifier: string,
    options?: RateLimitCheckOptions,
  ): Promise<RateLimitResult>;
};

/** Internal representation of an in-memory rate-limit bucket. */
type MemoryRateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Validates that a value is a positive safe integer.
 *
 * @param value - Value to validate.
 * @param name - Configuration property name for error messages.
 * @throws {TypeError} If the value is invalid.
 */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      `Invalid rate limiter configuration: "${name}" must be a positive safe integer.`,
    );
  }
}

/**
 * Validates rate-limiter configuration.
 *
 * @param config - Configuration to validate.
 * @throws {TypeError} If any configuration value is invalid.
 */
function validateConfig(config: RateLimitConfig): void {
  assertPositiveInteger(config.windowMs, "windowMs");
  assertPositiveInteger(config.maxRequests, "maxRequests");

  if (config.cleanupIntervalMs !== undefined) {
    assertPositiveInteger(config.cleanupIntervalMs, "cleanupIntervalMs");
  }

  if (
    config.namespace !== undefined &&
    (typeof config.namespace !== "string" ||
      config.namespace.trim().length === 0)
  ) {
    throw new TypeError(
      'Invalid rate limiter configuration: "namespace" must be a non-empty string.',
    );
  }
}

/**
 * In-memory rate-limit storage.
 *
 * @remarks
 * This store is process-local. Its counters are not shared between
 * application instances and are lost when the process restarts.
 *
 * Use a shared storage implementation for serverless or multi-instance
 * production deployments.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, MemoryRateLimitEntry>();

  private lastCleanupAt: number | undefined;

  private readonly cleanupIntervalMs: number;

  /**
   * Creates an in-memory rate-limit store.
   *
   * @param cleanupIntervalMs - Minimum interval between cleanup passes.
   * @default 60_000
   */
  public constructor(cleanupIntervalMs = 60_000) {
    assertPositiveInteger(cleanupIntervalMs, "cleanupIntervalMs");
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  /**
   * Atomically consumes a request within the current JavaScript process.
   *
   * The request that reaches the configured maximum is allowed.
   * Subsequent requests are rejected until the window expires.
   *
   * @param key - Unique rate-limit bucket key.
   * @param options - Window configuration and current timestamp.
   * @returns Updated counter state and request acceptance status.
   */
  public consume(
    key: string,
    options: RateLimitStoreOptions,
  ): RateLimitStoreResult {
    const { windowMs, maxRequests, now } = options;

    this.cleanupExpiredEntries(now);

    const existing = this.entries.get(key);

    if (existing === undefined || now >= existing.resetAt) {
      const entry: MemoryRateLimitEntry = {
        count: 1,
        resetAt: now + windowMs,
      };

      this.entries.set(key, entry);

      return {
        count: entry.count,
        resetAt: entry.resetAt,
        allowed: true,
      };
    }

    if (existing.count >= maxRequests) {
      return {
        count: existing.count,
        resetAt: existing.resetAt,
        allowed: false,
      };
    }

    existing.count += 1;

    return {
      count: existing.count,
      resetAt: existing.resetAt,
      allowed: true,
    };
  }

  /**
   * Removes expired entries when the cleanup interval has elapsed.
   *
   * @param now - Current timestamp in milliseconds.
   */
  private cleanupExpiredEntries(now: number): void {
    if (
      this.lastCleanupAt !== undefined &&
      now - this.lastCleanupAt < this.cleanupIntervalMs
    ) {
      return;
    }

    this.lastCleanupAt = now;

    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Creates a reusable rate limiter.
 *
 * @param config - Rate-limit configuration.
 * @param store - Optional custom storage implementation.
 * @returns A rate limiter with an asynchronous `check` method.
 *
 * @example
 * Basic usage:
 * ```ts
 * const limiter = createRateLimiter({
 *   windowMs: 60_000,
 *   maxRequests: 5,
 *   namespace: "login",
 * });
 *
 * const result = await limiter.check("user-123");
 *
 * if (result.limited) {
 *   console.log(`Retry in ${result.retryAfterMs}ms`);
 * }
 * ```
 *
 * @example
 * Using a custom shared store:
 * ```ts
 * const limiter = createRateLimiter(
 *   {
 *     windowMs: 60_000,
 *     maxRequests: 100,
 *     namespace: "api",
 *   },
 *   redisRateLimitStore,
 * );
 * ```
 */
export function createRateLimiter(
  config: RateLimitConfig,
  store?: RateLimitStore,
): RateLimiter {
  validateConfig(config);

  const rateLimitStore =
    store ?? new MemoryRateLimitStore(config.cleanupIntervalMs ?? 60_000);

  const defaultNamespace = config.namespace ?? "default";

  return {
    async check(
      identifier: string,
      options?: RateLimitCheckOptions,
    ): Promise<RateLimitResult> {
      if (typeof identifier !== "string" || identifier.trim().length === 0) {
        throw new TypeError(
          "Rate-limit identifier must be a non-empty string.",
        );
      }

      if (
        options?.namespace !== undefined &&
        (typeof options.namespace !== "string" ||
          options.namespace.trim().length === 0)
      ) {
        throw new TypeError("Rate-limit namespace must be a non-empty string.");
      }

      const namespace = options?.namespace ?? defaultNamespace;

      // Separate counters for distinct namespaces and configurations.
      const key = [
        encodeURIComponent(namespace),
        config.windowMs,
        config.maxRequests,
        encodeURIComponent(identifier),
      ].join(":");

      const now = Date.now();

      const result = await rateLimitStore.consume(key, {
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
        now,
      });

      if (
        result === null ||
        typeof result !== "object" ||
        !Number.isSafeInteger(result.count) ||
        result.count < 1 ||
        result.count > config.maxRequests ||
        !Number.isSafeInteger(result.resetAt) ||
        result.resetAt <= now ||
        typeof result.allowed !== "boolean"
      ) {
        throw new Error("Rate-limit store returned an invalid result.");
      }

      if (result.allowed && result.count > config.maxRequests) {
        throw new Error(
          "Rate-limit store accepted a request beyond the configured limit.",
        );
      }

      const limited = !result.allowed;

      return {
        limited,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - result.count),
        resetAt: result.resetAt,
        retryAfterMs: limited ? Math.max(0, result.resetAt - now) : 0,
      };
    },
  };
}
