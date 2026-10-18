/**
 * Application error utilities for creating typed errors and standardized
 * JSON HTTP error responses.
 *
 * @packageDocumentation
 */

/**
 * Describes the severity of an application error.
 */
export type ErrorPriority = "high" | "medium" | "low";

/**
 * Defines the configuration for a reusable application error preset.
 */
export type AppErrorPreset = {
  /** Stable machine-readable error code. */
  code: string;

  /** Safe, user-facing error message. */
  message: string;

  /** HTTP error status code, from 400 through 599. */
  status: number;

  /** Relative severity of the error. */
  priority: ErrorPriority;

  /** Optional additional information safe to expose to clients. */
  details?: Record<string, unknown>;
};

/**
 * Built-in application error presets.
 *
 * These presets are included by default unless explicitly disabled.
 */
export const defaultErrorPreset = {
  UNKNOWN: {
    code: "UNKNOWN",
    message: "An unknown error occurred.",
    status: 500,
    priority: "high",
  },
  TOO_MANY_REQUESTS: {
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests. Please try again later.",
    status: 429,
    priority: "medium",
  },
  INVALID_REQUEST: {
    code: "INVALID_REQUEST",
    message: "The request is invalid.",
    status: 400,
    priority: "low",
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "Authentication is required.",
    status: 401,
    priority: "medium",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action.",
    status: 403,
    priority: "medium",
  },
  UNAVAILABLE: {
    code: "UNAVAILABLE",
    message: "The service is temporarily unavailable.",
    status: 503,
    priority: "high",
  },
  INTERNAL_SERVER: {
    code: "INTERNAL_SERVER",
    message: "An unexpected server error occurred.",
    status: 500,
    priority: "high",
  },
} as const satisfies Record<string, AppErrorPreset>;

/** Keys available in the built-in error preset collection. */
export type DefaultErrorKeys = keyof typeof defaultErrorPreset;

/**
 * Extracts string keys from a type, excluding number and symbol keys.
 */
type StringKeyOf<T> = Extract<keyof T, string>;

/**
 * Resolves the valid preset keys for a configured error class.
 */
export type ErrorPresetKeys<
  P extends Record<string, AppErrorPreset>,
  IncludeDefaults extends boolean,
> = StringKeyOf<P> | (IncludeDefaults extends true ? DefaultErrorKeys : never);

/**
 * Defines the overrides accepted when creating an application error.
 *
 * Unlike preset configuration, instance overrides can include a native
 * JavaScript error cause.
 */
export type AppErrorOverrides = Partial<AppErrorPreset> & {
  /** Original error or underlying failure. */
  cause?: unknown;
};

/**
 * Defines the configuration accepted by {@link createAppError}.
 */
export type ErrorConfigOptions<
  P extends Record<string, AppErrorPreset>,
  IncludeDefaults extends boolean,
> = {
  /** Custom application error presets. */
  presets?: P;

  /**
   * Whether built-in error presets should be included.
   *
   * @default true
   */
  includeDefaultPresets?: IncludeDefaults;

  /** Partial overrides for registered presets. */
  overrides?: Partial<
    Record<ErrorPresetKeys<P, IncludeDefaults>, Partial<AppErrorPreset>>
  >;

  /**
   * Name assigned to errors created by the returned class.
   *
   * @default "AppError"
   */
  name?: string;
};

/**
 * Standardized JSON error response body.
 */
export type ErrorResponseBody = {
  error: {
    /** Stable machine-readable error code. */
    code: string;

    /** Safe, user-facing error message. */
    message: string;

    /** Optional additional response details. */
    details?: Record<string, unknown>;
  };
};

/**
 * Identifies application errors across package instances.
 */
export const APP_ERROR_BRAND: unique symbol = Symbol.for(
  "@tolha/react/AppError",
);

/**
 * Internal structural representation used when validating errors.
 */
type BrandedError = Error & {
  readonly [APP_ERROR_BRAND]?: unknown;
  readonly code?: unknown;
  readonly status?: unknown;
  readonly priority?: unknown;
  readonly details?: unknown;
};

/**
 * Determines whether a value is a valid HTTP error status.
 *
 * @param status - Value to validate.
 * @returns `true` when the value is an integer between 400 and 599.
 */
function isErrorStatus(status: unknown): status is number {
  return (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  );
}

/**
 * Determines whether a value is a supported error priority.
 *
 * @param value - Value to validate.
 * @returns `true` when the value is a supported priority.
 */
function isErrorPriority(value: unknown): value is ErrorPriority {
  return value === "high" || value === "medium" || value === "low";
}

/**
 * Determines whether a value is a non-null, non-array record.
 *
 * @param value - Value to validate.
 * @returns `true` when the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an application error preset at runtime.
 *
 * @param value - Unknown value to validate.
 * @returns `true` when the value satisfies the preset structure.
 */
export function isAppErrorPreset(value: unknown): value is AppErrorPreset {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    value.code.trim().length > 0 &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    isErrorStatus(value.status) &&
    isErrorPriority(value.priority) &&
    (value.details === undefined || isRecord(value.details))
  );
}

/**
 * Checks whether a value is an application error created by
 * {@link createAppError}.
 *
 * @param value - Value to check.
 * @returns `true` when the value is a branded application error.
 */
export function isConfiguredAppError(value: unknown): value is Error & {
  readonly [APP_ERROR_BRAND]: true;
  readonly code: string;
  readonly status: number;
  readonly priority: ErrorPriority;
  readonly details?: Record<string, unknown>;
} {
  if (!(value instanceof Error)) {
    return false;
  }

  const error = value as BrandedError;

  return (
    error[APP_ERROR_BRAND] === true &&
    typeof error.code === "string" &&
    isErrorStatus(error.status) &&
    isErrorPriority(error.priority) &&
    (error.details === undefined || isRecord(error.details))
  );
}

/**
 * Default response configuration for unexpected errors.
 */
const INTERNAL_SERVER_PRESET: AppErrorPreset =
  defaultErrorPreset.INTERNAL_SERVER;

/**
 * Resolves an unknown value into a safe error response representation.
 *
 * Only branded application errors retain their configured status and
 * message. Other values produce a generic internal server error.
 *
 * @param error - Error or unknown value to resolve.
 * @returns The safe error response representation.
 */
function resolveError(error: unknown): AppErrorPreset {
  if (!isConfiguredAppError(error)) {
    return INTERNAL_SERVER_PRESET;
  }

  return {
    code: error.code,
    message: error.message,
    status: error.status,
    priority: error.priority,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

/**
 * Serializes an error response and handles non-serializable details.
 *
 * When serialization fails, optional details are omitted and a minimal
 * JSON error response is returned.
 *
 * @param body - Response body to serialize.
 * @param status - HTTP response status.
 * @returns A JSON HTTP response.
 */
function createJsonResponse(body: ErrorResponseBody, status: number): Response {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    const serialized = JSON.stringify(body);

    if (serialized !== undefined) {
      return new Response(serialized, {
        status,
        headers,
      });
    }
  } catch {
    // Fall back to a response without optional details.
  }

  const fallbackBody: ErrorResponseBody = {
    error: {
      code: body.error.code,
      message: body.error.message,
    },
  };

  return new Response(JSON.stringify(fallbackBody), {
    status,
    headers,
  });
}

/**
 * Converts an error into a standardized JSON HTTP response.
 *
 * Application errors retain their configured status, code, message,
 * and optional details. Unexpected errors receive a generic 500 response
 * so that internal exception messages and stack traces are not exposed.
 *
 * @param error - Error or unknown value to convert.
 * @returns A JSON HTTP response.
 *
 * @example
 * ```ts
 * return ErrorResponse(new Error("Unexpected failure"));
 * ```
 */
export function ErrorResponse(error: unknown): Response {
  const resolved = resolveError(error);

  const body: ErrorResponseBody = {
    error: {
      code: resolved.code,
      message: resolved.message,
      ...(resolved.details !== undefined ? { details: resolved.details } : {}),
    },
  };

  return createJsonResponse(body, resolved.status);
}

/**
 * Creates a configured application error class.
 *
 * The returned class supports built-in presets, custom presets, preset
 * overrides, native error causes, and standardized JSON responses.
 *
 * @typeParam P - Custom error presets registered with the factory.
 * @typeParam IncludeDefaults - Whether built-in preset keys are available.
 * @param options - Error class and preset configuration.
 * @returns A configured application error class.
 *
 * @example
 * ```ts
 * const AppError = createAppError({
 *   presets: {
 *     USER_NOT_FOUND: {
 *       code: "USER_NOT_FOUND",
 *       message: "The requested user was not found.",
 *       status: 404,
 *       priority: "low",
 *     },
 *   },
 * });
 *
 * throw new AppError("USER_NOT_FOUND");
 * ```
 */
export function createAppError<
  const P extends Record<string, AppErrorPreset> = Record<never, never>,
  const IncludeDefaults extends boolean = true,
>(options: ErrorConfigOptions<P, IncludeDefaults> = {}) {
  const includeDefaults =
    options.includeDefaultPresets === undefined
      ? true
      : options.includeDefaultPresets;

  const presetMap: Record<string, AppErrorPreset> = {
    ...(includeDefaults ? defaultErrorPreset : {}),
    ...(options.presets ?? {}),
  };

  /**
   * Applies configuration-time overrides to registered presets.
   */
  for (const [key, override] of Object.entries(options.overrides ?? {})) {
    if (!Object.hasOwn(presetMap, key)) {
      throw new TypeError(
        `Cannot override unknown application error preset "${key}".`,
      );
    }

    const currentPreset = presetMap[key];

    if (currentPreset === undefined) {
      throw new TypeError(`Application error preset "${key}" is unavailable.`);
    }

    const mergedPreset: AppErrorPreset = {
      ...currentPreset,
      ...override,
    };

    if (!isAppErrorPreset(mergedPreset)) {
      throw new TypeError(
        `Application error preset "${key}" has an invalid configuration.`,
      );
    }

    presetMap[key] = mergedPreset;
  }

  /**
   * Validates every registered preset before creating the class.
   */
  for (const [key, preset] of Object.entries(presetMap)) {
    if (!isAppErrorPreset(preset)) {
      throw new TypeError(
        `Application error preset "${key}" has an invalid configuration.`,
      );
    }
  }

  /**
   * Configured application error class.
   */
  class ConfiguredAppError extends Error {
    /** Identifies the error as an application error. */
    public readonly [APP_ERROR_BRAND] = true as const;

    /** Stable machine-readable error code. */
    public readonly code: string;

    /** HTTP error status code. */
    public readonly status: number;

    /** Relative severity of the error. */
    public readonly priority: ErrorPriority;

    /** Optional additional response details. */
    public readonly details?: Record<string, unknown>;

    /**
     * Creates an application error from a preset key, preset object,
     * or existing native error.
     *
     * @param input - Registered preset key, preset configuration, or error.
     * @param overrides - Optional per-instance overrides and error cause.
     * @throws {TypeError} If the preset or final configuration is invalid.
     *
     * @example
     * ```ts
     * new AppError("FORBIDDEN");
     *
     * new AppError("USER_NOT_FOUND", {
     *   details: { userId: "123" },
     * });
     *
     * new AppError("INTERNAL_SERVER", {
     *   cause: new Error("Database query failed"),
     * });
     * ```
     */
    public constructor(
      input: ErrorPresetKeys<P, IncludeDefaults> | AppErrorPreset | Error,
      overrides: AppErrorOverrides = {},
    ) {
      let preset: AppErrorPreset;

      if (input instanceof Error) {
        preset = INTERNAL_SERVER_PRESET;
      } else if (typeof input === "string") {
        if (!Object.hasOwn(presetMap, input)) {
          throw new TypeError(`Unknown application error preset "${input}".`);
        }

        const registeredPreset = presetMap[input];

        if (registeredPreset === undefined) {
          throw new TypeError(
            `Application error preset "${input}" is unavailable.`,
          );
        }

        preset = registeredPreset;
      } else if (isAppErrorPreset(input)) {
        preset = input;
      } else {
        throw new TypeError(
          "AppError input must be a valid preset key, preset, or Error instance.",
        );
      }

      const { cause: explicitCause, ...presetOverrides } = overrides;

      const config: AppErrorPreset = {
        ...preset,
        ...presetOverrides,
      };

      if (!isAppErrorPreset(config)) {
        throw new TypeError("Invalid application error configuration.");
      }

      const cause = Object.hasOwn(overrides, "cause")
        ? explicitCause
        : input instanceof Error
          ? input
          : undefined;

      super(config.message, cause !== undefined ? { cause } : undefined);

      this.name = options.name ?? "AppError";
      this.code = config.code;
      this.status = config.status;
      this.priority = config.priority;

      if (config.details !== undefined) {
        this.details = config.details;
      }

      Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Converts an error into a standardized JSON HTTP response.
     *
     * This static method delegates to {@link ErrorResponse}.
     *
     * @param error - Error or unknown value to convert.
     * @returns A JSON HTTP response.
     *
     * @example
     * ```ts
     * return AppError.response(new AppError("FORBIDDEN"));
     * ```
     */
    public static response(error: unknown): Response {
      return ErrorResponse(error);
    }
  }

  return ConfiguredAppError;
}
