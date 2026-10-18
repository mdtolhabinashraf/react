import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_ERROR_BRAND,
  createAppError,
  defaultErrorPreset,
  ErrorResponse,
  isAppErrorPreset,
  isConfiguredAppError,
} from "../../src/utils/app-error";

const AppError = createAppError({
  name: "TestAppError",
  presets: {
    USER_NOT_FOUND: {
      code: "USER_NOT_FOUND",
      message: "The requested user was not found.",
      status: 404,
      priority: "low",
    },
    EMAIL_ALREADY_EXISTS: {
      code: "EMAIL_ALREADY_EXISTS",
      message: "An account with this email already exists.",
      status: 409,
      priority: "low",
    },
  },
});

describe("defaultErrorPreset", () => {
  it("defines the expected built-in presets", () => {
    expect(defaultErrorPreset.UNKNOWN.status).toBe(500);
    expect(defaultErrorPreset.INVALID_REQUEST.status).toBe(400);
    expect(defaultErrorPreset.UNAUTHORIZED.status).toBe(401);
    expect(defaultErrorPreset.FORBIDDEN.status).toBe(403);
    expect(defaultErrorPreset.TOO_MANY_REQUESTS.status).toBe(429);
    expect(defaultErrorPreset.UNAVAILABLE.status).toBe(503);
  });
});

describe("isAppErrorPreset", () => {
  it("accepts a valid preset", () => {
    expect(
      isAppErrorPreset({
        code: "NOT_FOUND",
        message: "Resource not found.",
        status: 404,
        priority: "low",
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    "NOT_FOUND",
    {},
    { code: "", message: "Error", status: 404, priority: "low" },
    { code: "ERROR", message: "", status: 404, priority: "low" },
    { code: "ERROR", message: "Error", status: 200, priority: "low" },
    { code: "ERROR", message: "Error", status: 600, priority: "low" },
    { code: "ERROR", message: "Error", status: 404, priority: "critical" },
    {
      code: "ERROR",
      message: "Error",
      status: 404,
      priority: "low",
      details: [],
    },
  ])("rejects invalid preset: %j", (preset) => {
    expect(isAppErrorPreset(preset)).toBe(false);
  });
});

describe("isConfiguredAppError", () => {
  it("recognizes errors created by the configured class", () => {
    const error = new AppError("USER_NOT_FOUND");

    expect(isConfiguredAppError(error)).toBe(true);
    expect(error[APP_ERROR_BRAND]).toBe(true);
  });

  it("rejects ordinary errors", () => {
    expect(isConfiguredAppError(new Error("Unexpected error"))).toBe(false);
  });

  it("rejects non-error values", () => {
    expect(isConfiguredAppError(null)).toBe(false);
    expect(isConfiguredAppError({ code: "ERROR" })).toBe(false);
  });
});

describe("createAppError", () => {
  it("creates an error from a built-in preset", () => {
    const error = new AppError("FORBIDDEN");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TestAppError");
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe(
      "You do not have permission to perform this action.",
    );
    expect(error.status).toBe(403);
    expect(error.priority).toBe("medium");
  });

  it("creates an error from a custom preset", () => {
    const error = new AppError("USER_NOT_FOUND");

    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.message).toBe("The requested user was not found.");
    expect(error.status).toBe(404);
    expect(error.priority).toBe("low");
  });

  it("supports per-instance overrides", () => {
    const error = new AppError("USER_NOT_FOUND", {
      message: "User 123 was not found.",
      status: 410,
      priority: "medium",
      details: {
        resource: "user",
      },
    });

    expect(error.message).toBe("User 123 was not found.");
    expect(error.status).toBe(410);
    expect(error.priority).toBe("medium");
    expect(error.details).toEqual({ resource: "user" });
  });

  it("preserves details from a preset when not overridden", () => {
    const CustomError = createAppError({
      presets: {
        INVALID_INPUT: {
          code: "INVALID_INPUT",
          message: "Invalid input.",
          status: 400,
          priority: "low",
          details: {
            field: "email",
          },
        },
      },
    });

    expect(new CustomError("INVALID_INPUT").details).toEqual({
      field: "email",
    });
  });

  it("supports native Error causes", () => {
    const originalError = new Error("Database connection failed");
    const error = new AppError(originalError);

    expect(error.cause).toBe(originalError);
    expect(error.code).toBe("INTERNAL_SERVER");
    expect(error.status).toBe(500);
  });

  it("supports an explicit cause override", () => {
    const originalError = new Error("Original failure");
    const replacementCause = new Error("Replacement failure");

    const error = new AppError(originalError, {
      cause: replacementCause,
    });

    expect(error.cause).toBe(replacementCause);
  });

  it("rejects an invalid preset object", () => {
    expect(
      () =>
        new AppError({
          code: "BROKEN",
          message: "Broken",
          status: 200,
          priority: "low",
        } as never),
    ).toThrow(TypeError);
  });

  it("does not allow overrides for unknown preset keys", () => {
    expect(() =>
      createAppError({
        presets: {},
        overrides: {
          NOT_REGISTERED: {
            message: "Invalid override",
          },
        } as never,
      }),
    ).toThrow(/unknown application error preset/i);
  });

  it("supports disabling built-in presets", () => {
    const CustomError = createAppError({
      includeDefaultPresets: false,
      presets: {
        CUSTOM_FAILURE: {
          code: "CUSTOM_FAILURE",
          message: "A custom failure occurred.",
          status: 422,
          priority: "medium",
        },
      },
    });

    const error = new CustomError("CUSTOM_FAILURE");

    expect(error.status).toBe(422);
    expect(error.code).toBe("CUSTOM_FAILURE");
  });
});

describe("ErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a JSON response for a configured application error", async () => {
    const response = ErrorResponse(new AppError("USER_NOT_FOUND"));

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "USER_NOT_FOUND",
        message: "The requested user was not found.",
      },
    });
  });

  it("uses the configured static response helper", async () => {
    const response = AppError.response(new AppError("FORBIDDEN"));

    expect(response.status).toBe(403);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  it("includes safe error details in the response", async () => {
    const error = new AppError("INVALID_REQUEST", {
      details: {
        field: "email",
      },
    });

    const response = ErrorResponse(error);

    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The request is invalid.",
        details: {
          field: "email",
        },
      },
    });
  });

  it("returns a generic 500 for ordinary errors", async () => {
    const response = ErrorResponse(
      new Error("Sensitive database connection string"),
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toEqual({
      error: {
        code: "INTERNAL_SERVER",
        message: "An unexpected server error occurred.",
      },
    });

    expect(JSON.stringify(body)).not.toContain(
      "Sensitive database connection string",
    );
  });

  it("returns a generic 500 for non-error values", async () => {
    const response = ErrorResponse("unexpected string");

    expect(response.status).toBe(500);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_SERVER",
        message: "An unexpected server error occurred.",
      },
    });
  });

  it("falls back safely when response details cannot be serialized", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const error = new AppError("INVALID_REQUEST", {
      details: circular,
    });

    const response = ErrorResponse(error);

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The request is invalid.",
      },
    });
  });
});
