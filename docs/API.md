# API Reference

Complete API reference for `@tolha/react`, covering the package's utility functions, types, classes, and configuration options.

## Table of Contents

- [Installation](#installation)
- [Imports](#imports)
- [UUID](#uuid)
- [Endpoint Utilities](#endpoint-utilities)
- [Endpoint Client](#endpoint-client)
- [IP Address Utilities](#ip-address-utilities)
- [HTTP Header Utilities](#http-header-utilities)
- [User-Agent Detection](#user-agent-detection)
- [Rate Limiting](#rate-limiting)
- [Application Errors](#application-errors)
- [TypeScript Types](#typescript-types)
- [Runtime Requirements](#runtime-requirements)
- [Security Considerations](#security-considerations)

## Installation

```bash
npm install @tolha/react
```

## Imports

The package has a browser-safe root entry point and a server entry point. Import
UUID and application-error utilities from `@tolha/react`; import request and
endpoint utilities from `@tolha/react/server`.

```ts
import {
  UUID,
  createAppError,
  ErrorResponse,
  isAppErrorPreset,
  isConfiguredAppError,
  defaultErrorPreset,
  APP_ERROR_BRAND,
} from "@tolha/react";

import type {
  ErrorPriority,
  AppErrorPreset,
  AppErrorOverrides,
  ErrorConfigOptions,
  ErrorResponseBody,
  DefaultErrorKeys,
  ErrorPresetKeys,
} from "@tolha/react";

import {
  sanitizeIp,
  getClientIp,
  getHeader,
  getUserAgent,
  createRateLimiter,
  MemoryRateLimitStore,
  Endpoint,
  EndpointRegistry,
  EndpointClient,
} from "@tolha/react/server";

import type {
  RateLimitConfig,
  RateLimitStore,
  RateLimitStoreOptions,
  RateLimitStoreResult,
  RateLimitResult,
  RateLimitCheckOptions,
  RateLimiter,
  UserAgentInfo,
  UserAgentBrowserName,
  UserAgentOSName,
  UserAgentDeviceType,
  UserAgentEngineName,
  UserAgentArchitecture,
  HttpMethod,
  EndpointContext,
  EndpointContextFactory,
  EndpointMiddlewareArgs,
  EndpointMiddleware,
  EndpointHandlerArgs,
  EndpointHandler,
  JoinPaths,
} from "@tolha/react/server";
```

`zod` is a runtime dependency and is used to define endpoint input schemas:

```ts
import { z } from "zod";
```

The `@tolha/react/browser` subpath is reserved for browser-specific exports.
The current package does not expose additional browser utilities from that
entry point.

---

## UUID

The `UUID` class provides static methods for generating UUID-like strings, extracting timestamps, and validating UUID strings.

### `UUID.random(timestamp?, uppercase?)`

Generates a random identifier using `crypto.randomUUID()`.

**Parameters**

| Parameter   | Type      | Default | Description                                                                      |
| ----------- | --------- | ------- | -------------------------------------------------------------------------------- |
| `timestamp` | `boolean` | `false` | If `true`, prefixes the identifier with a hexadecimal Unix timestamp in seconds. |
| `uppercase` | `boolean` | `false` | If `true`, returns the result in uppercase.                                      |

**Returns:** `string`

```ts
import { UUID } from "@tolha/react";

const id = UUID.random();
const uppercaseId = UUID.random(false, true);
const timestampId = UUID.random(true);
```

**Important:** When `timestamp` is `true`, the implementation modifies the UUID format. The resulting value may not satisfy the standard UUID format expected by `UUID.validate()`.

### `UUID.getTime(uuid)`

Extracts a timestamp from the first eight hexadecimal characters of a string and returns it as a JavaScript `Date`.

**Parameters**

| Parameter | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `uuid`    | `string` | String from which to extract the timestamp. |

**Returns:** `Date | null`

```ts
const date = UUID.getTime("6712ABCD-1234-4234-8234-123456789ABC");

if (date) {
  console.log(date.toISOString());
}
```

The implementation reads the first eight hexadecimal characters as Unix seconds. It does not verify that the string is a valid UUID before extracting the timestamp.

### `UUID.validate(uuid, expires?)`

Checks whether a string matches the implementation's UUID pattern and optionally compares the extracted timestamp with an expiration value.

**Parameters**

| Parameter | Type             | Description                                                                                                 |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `uuid`    | `string`         | UUID-formatted string to validate.                                                                          |
| `expires` | `Date \| number` | Optional expiration configuration. A number is treated as a duration in milliseconds from the current time. |

**Returns:** `boolean`

```ts
const valid = UUID.validate("6712ABCD-1234-4234-8234-123456789ABC");

const withExpiration = UUID.validate(
  "6712ABCD-1234-4234-8234-123456789ABC",
  60_000,
);
```

**Implementation notes**

- The UUID format check validates hexadecimal groups and hyphens but does not enforce a specific UUID version or variant.
- Numeric `expires` values are converted to `new Date(Date.now() + expires)`.
- The current implementation compares the extracted timestamp with the supplied expiration date. It does not implement a conventional maximum-age check.
- A timestamp is not necessarily encoded in an ordinary UUID. Use timestamp extraction only with identifiers whose format is explicitly designed for it.

---

## Endpoint Utilities

Endpoint utilities are available from `@tolha/react/server`. They define
type-safe request handlers with optional Zod validation, request-scoped
context, middleware, and response helpers. They do not register routes or
convert thrown errors into HTTP responses; use them from your framework's
server adapter.

### `Endpoint`

`Endpoint` represents one concrete route.

```ts
import { z } from "zod";
import { Endpoint } from "@tolha/react/server";

const getUser = new Endpoint({
  path: "/users/:id",
  method: "GET",
  input: {
    querySchema: z.object({
      includePosts: z.coerce.boolean().optional(),
    }),
  },
  context: async () => ({
    userId: "authenticated-user",
  }),
  middleware: [
    ({ context }) => {
      if (!context.userId) {
        throw new Error("Unauthorized");
      }
    },
  ],
  handler: ({ query, context, response }) =>
    response.json({
      userId: context.userId,
      includePosts: query?.includePosts ?? false,
    }),
});

const result = await getUser.handle(
  new Request("https://example.com/users/123?includePosts=true"),
);
```

#### Constructor configuration

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | `string` | Yes | Route pathname. Repeated or trailing slashes are normalized. |
| `method` | `HttpMethod` | Yes | HTTP method handled by the endpoint. |
| `input.querySchema` | Zod schema | No | Validates parsed URL query parameters. |
| `input.dataSchema` | Zod schema | No | Validates a JSON request body. |
| `context` | `EndpointContextFactory` | No | Creates request-scoped context before middleware runs. |
| `middleware` | `EndpointMiddleware[]` | No | Sequential hooks executed before validation and the handler. |
| `handler` | `EndpointHandler` | Yes | Produces the endpoint result. |

The instance exposes:

- `path`: normalized endpoint pathname.
- `method`: configured HTTP method.
- `config`: a frozen, shallow snapshot of the configuration.
- `handle(request)`: executes the endpoint lifecycle and returns the awaited
  handler result.

`handle()` executes in this order: create response helpers, resolve context,
run middleware, validate the query, validate the JSON body, then call the
handler. If no schema is configured, `query` or `data` is `undefined`.
Repeated query keys are represented as arrays. A body schema requires a JSON
content type (`application/json` or a structured `+json` type). Validation
failures throw configured endpoint errors with `400` status. Errors from
context, middleware, or the handler are propagated unchanged.

`GET` and `HEAD` endpoints cannot declare `input.dataSchema`. This restriction
is enforced both by the TypeScript configuration type and at runtime for
JavaScript callers or code that bypasses type checking.

#### Handler and middleware arguments

Both handlers and middleware receive `request`, `context`, and `response`.
Handlers additionally receive parsed `query` and `data` values:

```ts
const endpoint = new Endpoint({
  path: "/health",
  method: "GET",
  handler: ({ request, query, data, context, response }) => {
    return response.json({ ok: true });
  },
});
```

The response helper methods are:

| Method | Description |
| --- | --- |
| `response.json(body, init?)` | Creates a JSON response and sets `application/json; charset=utf-8` when absent. |
| `response.text(body, init?)` | Creates a plain-text response and sets `text/plain; charset=utf-8` when absent. |
| `response.html(body, init?)` | Creates an HTML response and sets `text/html; charset=utf-8` when absent. |
| `response.redirect(url, status?)` | Creates a redirect; the default status is `302`. |
| `response.raw(response)` | Returns an existing native `Response` unchanged. |

The JSON, text, and HTML helpers preserve the response body type for TypeScript
inference. This allows an endpoint's declared result type to flow into
`Endpoint` metadata and into the endpoint client.

#### Endpoint inference metadata

Each endpoint exposes a type-only `$infer` property for sharing its route
contract with other type-safe tools:

```ts
const createUser = new Endpoint({
  path: "/users",
  method: "POST",
  input: {
    dataSchema: z.object({
      name: z.string(),
    }),
  },
  handler: ({ data, response }) =>
    response.json({
      id: "user-123",
      name: data.name,
    }),
});

type CreateUser = typeof createUser.$infer;
```

`$infer` contains the normalized `path`, HTTP `method`, parsed `query` and
`data` types, and the response body type inferred from the handler result. It
exists for type checking only and is not a runtime property.

### `EndpointRegistry`

`EndpointRegistry` is a reusable endpoint registry. It shares a base path, context
factory, and middleware across concrete routes.

```ts
import { EndpointRegistry } from "@tolha/react/server";

const api = new EndpointRegistry({
  basePath: "/api",
  context: ({ request }) => ({
    requestId: request.headers.get("x-request-id"),
  }),
  middleware: [
    ({ request }) => {
      console.log(request.method);
    },
  ],
});

const listUsers = api.create({
  path: "/users",
  method: "GET",
  handler: ({ context, response }) =>
    response.json({ requestId: context.requestId }),
});
// listUsers.path is "/api/users"
```

`EndpointRegistry` exposes `basePath`, `config`, and `create(config)`.
`create()` joins and normalizes the registry base path with the route path.
Registry middleware runs before route middleware by default. Set
`middlewareMode: "override"` on a route to use only that route's middleware.
A route context factory replaces the registry context factory for that route.

### Endpoint types

- `HttpMethod`: `"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE"`.
- `EndpointContext`: object type for request-scoped values.
- `EndpointContextFactory<TContext>`: synchronous or asynchronous context factory.
- `EndpointMiddlewareArgs<TContext>` and `EndpointMiddleware<TContext>`:
  middleware arguments and hook types.
- `EndpointHandlerArgs<TQuery, TData, TContext>` and
  `EndpointHandler<TQuery, TData, TResult, TContext>`: handler arguments and
  return type.
- `JoinPaths<TBasePath, TPath>`: compile-time joined route path.

Use `Endpoint` and `EndpointRegistry` with a server adapter that performs
route matching and calls `handle()`. The endpoint utility does not enforce
request body size limits, authenticate requests, or send an error response
automatically.

---

## Endpoint Client

`EndpointClient` is a type-safe client for calling endpoint contracts from
another part of an application. It is exported from `@tolha/react/server` and
uses Apexa for HTTP requests.

The client accepts a tuple of endpoint metadata types. In practice, these can
come from `Endpoint` instances through their type-only `$infer` property:

```ts
import { Endpoint, EndpointClient } from "@tolha/react/server";
import { z } from "zod";

const createUser = new Endpoint({
  path: "/users",
  method: "POST",
  input: {
    dataSchema: z.object({
      name: z.string(),
    }),
  },
  handler: ({ data, response }) =>
    response.json({
      id: "user-123",
      name: data.name,
    }),
});

const getUser = new Endpoint({
  path: "/users/[userId]",
  method: "GET",
  input: {
    querySchema: z.object({
      includePosts: z.coerce.boolean().optional(),
    }),
  },
  handler: ({ query, response }) =>
    response.json({
      id: "user-123",
      includePosts: query?.includePosts ?? false,
    }),
});

type CreateUser = typeof createUser.$infer;
type GetUser = typeof getUser.$infer;

const client = new EndpointClient<[CreateUser, GetUser]>({
  baseUrl: "https://api.example.com",
});

const created = await client.users.post({
  data: { name: "Ada" },
});

const existing = await client.users["user-123"].get({
  query: { includePosts: true },
});
```

### `EndpointClient(options?)`

Creates a lazy, type-safe route proxy backed by Apexa. The returned value is
used directly as the route tree:

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `options` | `ClientOptions` | No | Apexa client configuration, including `baseUrl` and other request defaults. |

The returned route proxy supports direct chained access:

```ts
await client.users.post({ data: { name: "Ada" } });
await client.users["user-123"].get();
```

The implementation also provides `client.api` as an equivalent nested route
tree and `client.client` for access to the underlying Apexa instance. These
are auxiliary properties; endpoint calls are made through the direct route
chain shown above.

### Route mapping

- Path segments become nested properties.
- Kebab-case segments become camelCase properties (`sign-up` becomes
  `signUp`).
- Dynamic segments written as `[param]` become string-indexed properties.
- HTTP methods are lowercase properties such as `get`, `post`, `patch`, and
  `delete`.
- Multiple methods on the same path are preserved independently.
- Paths are normalized before requests are sent; duplicate and trailing
  slashes are removed.

Dynamic route parameters are represented by property access. The client does
not interpolate named placeholders from an options object.

### Request options and responses

Read methods (`get`, `delete`, `head`, and `options`) accept optional request
options. Mutation methods (`post`, `put`, and `patch`) accept request options
with `data` for the request body. Query parameters are passed through `query`.
Additional Apexa request options, such as headers, can be supplied unchanged.

`data` is translated to Apexa's request body argument and is not forwarded as
an extra request option. Each method returns `Promise<ApiResponse<TResult>>`,
where `TResult` is the response body type inferred from the endpoint contract.

The client currently supports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`,
and `OPTIONS`. Route matching, authentication, retries, and response error
handling remain responsibilities of the underlying HTTP client and application.

---

## IP Address Utilities

These utilities sanitize IP address strings and attempt to determine a client's IP address from a request.

### `sanitizeIp(ip)`

Checks whether a string matches one of the IPv4 or IPv6 patterns supported by the implementation.

**Parameters**

| Parameter | Type                  | Description          |
| --------- | --------------------- | -------------------- |
| `ip`      | `string \| undefined` | IP address to check. |

**Returns:** `string | null`

```ts
import { sanitizeIp } from "@tolha/react/server";

sanitizeIp("192.168.1.10"); // "192.168.1.10"
sanitizeIp("not-an-ip"); // null
sanitizeIp(undefined); // null
```

The function returns the original string when a supported pattern matches. It does not normalize the address into a canonical representation.

### `getClientIp(request)`

Attempts to determine the client IP address from a request.

**Parameters**

| Parameter | Type      | Description                                                         |
| --------- | --------- | ------------------------------------------------------------------- |
| `request` | `Request` | Incoming request whose headers or socket may contain an IP address. |

**Returns:** `string`

```ts
import { getClientIp } from "@tolha/react/server";

export function GET(request: Request) {
  const clientIp = getClientIp(request);

  return Response.json({ clientIp });
}
```

The implementation checks the following sources in this order:

1. `request.socket.remoteAddress`, when available.
2. `CF-Connecting-IP`.
3. The first address in `X-Forwarded-For`.
4. `X-Real-IP`.
5. The `Forwarded` header.
6. The fallback value `"0.0.0.0"`.

The first valid IP address found is returned.

**Security considerations**

Forwarded IP headers can be forged unless a trusted proxy controls them. Configure your reverse proxy and trust model carefully before using this value for authentication, access control, auditing, or rate limiting.

The socket fallback is an implementation-specific extension; a standard Fetch API `Request` does not expose a `socket` property.

---

## HTTP Header Utilities

### `getHeader(req, name)`

Retrieves a named HTTP header from a Fetch-style `Request` or a request object with a Node.js-style headers record.

**Parameters**

| Parameter | Type      | Description                             |
| --------- | --------- | --------------------------------------- |
| `req`     | `Request` | Request-like object containing headers. |
| `name`    | `string`  | Header name to retrieve.                |

**Returns:** `string | null`

```ts
import { getHeader } from "@tolha/react/server";

export function GET(request: Request) {
  const authorization = getHeader(request, "Authorization");
  const userAgent = getHeader(request, "User-Agent");

  return Response.json({
    hasAuthorization: authorization !== null,
    userAgent,
  });
}
```

**Behavior**

- Uses `.headers.get()` when available.
- Supports a headers record with string or string-array values.
- Joins array values with `", "`.
- Returns `null` when headers or the requested value are unavailable.

---

## User-Agent Detection

The user-agent utility parses an HTTP request's `User-Agent` header and returns structured browser, operating-system, device, rendering-engine, CPU-architecture, and bot information.

### `getUserAgent(request)`

**Parameters**

| Parameter | Type      | Description                                        |
| --------- | --------- | -------------------------------------------------- |
| `request` | `Request` | Incoming request containing the user-agent header. |

**Returns:** `UserAgentInfo`

```ts
import { getUserAgent } from "@tolha/react/server";

export function GET(request: Request) {
  const userAgent = getUserAgent(request);

  return Response.json({
    browser: userAgent.browser.name,
    browserVersion: userAgent.browser.version,
    os: userAgent.os.name,
    deviceType: userAgent.device.type,
    isBot: userAgent.isBot,
  });
}
```

### `UserAgentInfo`

| Property    | Type                       | Description                                        |
| ----------- | -------------------------- | -------------------------------------------------- |
| `raw`       | `string \| null`           | Trimmed user-agent string, or `null` when missing. |
| `isBot`     | `boolean`                  | Whether a recognized bot signature was detected.   |
| `isMobile`  | `boolean`                  | Whether the device was classified as mobile.       |
| `isTablet`  | `boolean`                  | Whether the device was classified as a tablet.     |
| `isDesktop` | `boolean`                  | Whether the device was classified as desktop.      |
| `browser`   | `{ name, version, major }` | Browser name, full version, and major version.     |
| `os`        | `{ name, version }`        | Operating-system name and version.                 |
| `device`    | `{ type, vendor, model }`  | Device category, vendor, and model.                |
| `engine`    | `{ name, version }`        | Browser rendering engine and version.              |
| `cpu`       | `{ architecture }`         | Detected CPU architecture classification.          |

The nested objects use the following types:

```ts
type BrowserInfo = {
  readonly name: UserAgentBrowserName;
  readonly version: string | null;
  readonly major: number | null;
};

type OSInfo = {
  readonly name: UserAgentOSName;
  readonly version: string | null;
};

type DeviceInfo = {
  readonly type: UserAgentDeviceType;
  readonly vendor: string | null;
  readonly model: string | null;
};

type EngineInfo = {
  readonly name: UserAgentEngineName;
  readonly version: string | null;
};

type CPUInfo = {
  readonly architecture: UserAgentArchitecture;
};
```

These helper types are illustrative; import them only if your package exports them.

### Supported classifications

**Browser names:** `Chrome`, `Chromium`, `Edge`, `Firefox`, `Safari`, `Opera`, `Samsung Internet`, `Brave`, `Internet Explorer`, `DuckDuckGo`, `Vivaldi`, `Yandex`, `Other`, and `Unknown`.

**Operating systems:** `Windows`, `macOS`, `iOS`, `Android`, `Chrome OS`, `Linux`, `Ubuntu`, `Other`, and `Unknown`.

**Device types:** `desktop`, `mobile`, `tablet`, `tv`, `console`, `wearable`, `embedded`, and `unknown`.

**Rendering engines:** `Blink`, `WebKit`, `Gecko`, `Trident`, `EdgeHTML`, `Presto`, `Other`, and `Unknown`.

**CPU architectures:** `x86`, `x64`, `arm`, `arm64`, `ia64`, and `unknown`.

**Important limitations**

- Detection relies on regular-expression matching against the user-agent string.
- User-agent strings can be missing, misleading, or deliberately spoofed.
- An unrecognized browser may be reported as `Other`; a missing user-agent header produces `Unknown` classifications.
- Bot detection recognizes known signatures and is not a reliable security boundary.
- Do not use these results alone for authorization or other security-sensitive decisions.

---

## Rate Limiting

The rate-limiting utilities provide a configurable request limiter with pluggable storage.

The built-in memory store is appropriate for development, tests, and single-process applications. Multi-instance and serverless deployments should use a shared, atomic storage implementation.

### `createRateLimiter(config, store?)`

Creates a reusable rate limiter.

**Parameters**

| Parameter | Type              | Required | Description                                                        |
| --------- | ----------------- | -------- | ------------------------------------------------------------------ |
| `config`  | `RateLimitConfig` | Yes      | Rate-limit configuration.                                          |
| `store`   | `RateLimitStore`  | No       | Custom storage implementation. Defaults to `MemoryRateLimitStore`. |

**Returns:** `RateLimiter`

**Throws:** `TypeError` if the configuration contains invalid values.

```ts
import { createRateLimiter } from "@tolha/react/server";

const loginLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  namespace: "login",
});

const result = await loginLimiter.check("user-123");

if (result.limited) {
  console.log(`Retry in ${result.retryAfterMs}ms`);
}
```

### `RateLimitConfig`

| Property            | Type     | Required | Default     | Description                                      |
| ------------------- | -------- | -------- | ----------- | ------------------------------------------------ |
| `windowMs`          | `number` | Yes      | —           | Rate-limit window duration in milliseconds.      |
| `maxRequests`       | `number` | Yes      | —           | Maximum accepted requests per bucket and window. |
| `namespace`         | `string` | No       | `"default"` | Namespace that separates independent limits.     |
| `cleanupIntervalMs` | `number` | No       | `60_000`    | Cleanup interval for the default memory store.   |

`windowMs`, `maxRequests`, and `cleanupIntervalMs` must be positive safe integers when provided. A namespace must be a non-empty string.

### `RateLimiter.check(identifier, options?)`

Checks whether a request from a given identifier is allowed.

**Parameters**

| Parameter    | Type                    | Required | Description                                  |
| ------------ | ----------------------- | -------- | -------------------------------------------- |
| `identifier` | `string`                | Yes      | Stable client, user, or resource identifier. |
| `options`    | `RateLimitCheckOptions` | No       | Optional per-check configuration.            |

**Returns:** `Promise<RateLimitResult>`

**Throws:** `TypeError` if the identifier or namespace is invalid. Throws an `Error` if the storage implementation returns an invalid result.

```ts
const result = await loginLimiter.check("user-123", {
  namespace: "password-reset",
});

console.log(result.limited);
console.log(result.remaining);
console.log(result.resetAt);
console.log(result.retryAfterMs);
```

### `RateLimitCheckOptions`

| Property    | Type     | Description                                        |
| ----------- | -------- | -------------------------------------------------- |
| `namespace` | `string` | Overrides the configured namespace for this check. |

Use consistent namespaces for operations that should share the same rate limit. Different namespaces receive separate buckets.

### `RateLimitResult`

| Property       | Type      | Description                                       |
| -------------- | --------- | ------------------------------------------------- |
| `limited`      | `boolean` | `true` if the current request was rejected.       |
| `limit`        | `number`  | Maximum permitted requests in the window.         |
| `remaining`    | `number`  | Number of additional requests available.          |
| `resetAt`      | `number`  | Window expiration timestamp in Unix milliseconds. |
| `retryAfterMs` | `number`  | Time until the window expires; `0` when allowed.  |

### `MemoryRateLimitStore`

The default in-memory implementation of `RateLimitStore`.

```ts
import { MemoryRateLimitStore } from "@tolha/react/server";

const store = new MemoryRateLimitStore(60_000);
```

**Constructor:** `new MemoryRateLimitStore(cleanupIntervalMs?)`

- `cleanupIntervalMs`: positive safe integer in milliseconds; defaults to `60_000`.
- `consume(key, options)`: consumes a request from a bucket and returns its updated count, reset timestamp, and acceptance status.

The store keeps counters in a process-local `Map`. Counters are not shared across processes or server instances and are lost when the process restarts.

### Custom storage

Implement `RateLimitStore` to use a shared data store.

```ts
import type {
  RateLimitStore,
  RateLimitStoreOptions,
  RateLimitStoreResult,
} from "@tolha/react/server";

const customStore: RateLimitStore = {
  consume(key: string, options: RateLimitStoreOptions): RateLimitStoreResult {
    // Replace with an atomic shared-storage operation.
    throw new Error("Implement storage");
  },
};
```

The example above is a type illustration, not a working store. A production implementation must atomically update the bucket and determine whether the request is allowed. Separate non-atomic read and write operations can allow concurrent requests to exceed the configured limit.

### Rate-limit bucket behavior

The implementation creates a bucket from the namespace, window duration, maximum request count, and identifier. A request that reaches the configured maximum is allowed; subsequent requests are rejected until the window expires.

---

## Application Errors

The application-error utilities create configured error classes, define reusable error presets, validate error structures, and serialize safe JSON HTTP responses.

### `createAppError(options?)`

Creates a configured application error class.

**Parameters**

| Parameter                       | Type                                                                            | Default      | Description                            |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| `options.presets`               | `P`                                                                             | —            | Custom error presets.                  |
| `options.includeDefaultPresets` | `IncludeDefaults`                                                               | `true`       | Whether built-in presets are included. |
| `options.overrides`             | `Partial<Record<ErrorPresetKeys<P, IncludeDefaults>, Partial<AppErrorPreset>>>` | —            | Configuration-time preset overrides.   |
| `options.name`                  | `string`                                                                        | `"AppError"` | Name assigned to created errors.       |

**Returns:** A configured error class whose constructor accepts a preset key, a valid preset object, or a native `Error`.

```ts
import { createAppError } from "@tolha/react";

const AppError = createAppError({
  presets: {
    USER_NOT_FOUND: {
      code: "USER_NOT_FOUND",
      message: "The requested user was not found.",
      status: 404,
      priority: "low",
    },
    INVALID_CREDENTIALS: {
      code: "INVALID_CREDENTIALS",
      message: "The supplied credentials are invalid.",
      status: 401,
      priority: "medium",
    },
  },
});

throw new AppError("USER_NOT_FOUND");
```

Built-in presets are included by default. Set `includeDefaultPresets: false` to disable them. When defaults are disabled, the valid preset-key type should reflect the custom presets only.

### `AppError` constructor

The class returned by `createAppError()` supports the following inputs:

```ts
new AppError("FORBIDDEN");

new AppError("USER_NOT_FOUND", {
  details: { userId: "123" },
});

new AppError("INTERNAL_SERVER", {
  cause: new Error("Database query failed"),
});
```

**Constructor parameters**

| Parameter   | Type                                                             | Description                                            |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| `input`     | `ErrorPresetKeys<P, IncludeDefaults> \| AppErrorPreset \| Error` | Registered preset key, preset object, or native error. |
| `overrides` | `AppErrorOverrides`                                              | Optional per-instance overrides and error cause.       |

**Instance properties**

| Property            | Type                                   | Description                                           |
| ------------------- | -------------------------------------- | ----------------------------------------------------- |
| `name`              | `string`                               | Configured error class name.                          |
| `message`           | `string`                               | User-facing error message.                            |
| `code`              | `string`                               | Stable machine-readable error code.                   |
| `status`            | `number`                               | HTTP error status from 400 through 599.               |
| `priority`          | `ErrorPriority`                        | `high`, `medium`, or `low`.                           |
| `details`           | `Record<string, unknown> \| undefined` | Optional additional response details.                 |
| `[APP_ERROR_BRAND]` | `true`                                 | Brand used to identify configured application errors. |
| `cause`             | `unknown`                              | Underlying cause when one is provided.                |

**Throws:** `TypeError` if the preset key is unknown or the preset configuration is invalid.

Passing a native `Error` creates an application error using the internal-server preset. Unless explicitly overridden, the original error is preserved as its cause.

### `AppError.response(error)`

Converts an error into a standardized JSON HTTP response.

```ts
return AppError.response(new AppError("FORBIDDEN"));
```

**Parameters:** `error: unknown`

**Returns:** `Response`

This method delegates to `ErrorResponse()`.

### `ErrorResponse(error)`

Converts an error or unknown value into a standardized JSON HTTP response.

```ts
import { ErrorResponse } from "@tolha/react";

try {
  // Application operation
} catch (error: unknown) {
  return ErrorResponse(error);
}
```

**Parameters:** `error: unknown`

**Returns:** `Response`

Configured, branded application errors retain their configured status, code, message, and optional details. Other errors are converted to a generic internal-server error response to avoid exposing internal exception messages or stack traces.

Example response:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

The response uses the `application/json; charset=utf-8` content type. If serializing optional details fails, the implementation retries with a minimal response without details.

### Built-in error presets

The `defaultErrorPreset` export contains the following presets:

| Key                 | Code                | HTTP status | Priority |
| ------------------- | ------------------- | ----------: | -------- |
| `UNKNOWN`           | `UNKNOWN`           |         500 | `high`   |
| `BAD_REQUEST`       | `BAD_REQUEST`       |         400 | `low`    |
| `TOO_MANY_REQUESTS` | `TOO_MANY_REQUESTS` |         429 | `medium` |
| `INVALID_REQUEST`   | `INVALID_REQUEST`   |         400 | `low`    |
| `UNAUTHORIZED`      | `UNAUTHORIZED`      |         401 | `medium` |
| `FORBIDDEN`         | `FORBIDDEN`         |         403 | `medium` |
| `UNAVAILABLE`       | `UNAVAILABLE`       |         503 | `high`   |
| `INTERNAL_SERVER`   | `INTERNAL_SERVER`   |         500 | `high`   |

Example:

```ts
import { defaultErrorPreset } from "@tolha/react";

console.log(defaultErrorPreset.TOO_MANY_REQUESTS.status); // 429
```

### `isAppErrorPreset(value)`

Checks whether a value satisfies the `AppErrorPreset` structure.

**Parameters:** `value: unknown`

**Returns:** `value is AppErrorPreset`

```ts
import { isAppErrorPreset } from "@tolha/react";

const valid = isAppErrorPreset({
  code: "NOT_FOUND",
  message: "Resource not found.",
  status: 404,
  priority: "low",
});
```

The value must have a non-empty code and message, an integer status from 400 through 599, a supported priority, and optional `details` represented by a non-array object.

### `isConfiguredAppError(value)`

Checks whether a value is an `Error` branded as a configured application error.

**Parameters:** `value: unknown`

**Returns:** Type predicate for a branded `Error` with valid code, status, priority, and optional details.

```ts
import { isConfiguredAppError } from "@tolha/react";

if (isConfiguredAppError(error)) {
  console.log(error.code, error.status);
}
```

This is a structural brand check; it should not be treated as proof that an error originated from a trusted source.

---

## TypeScript Types

The following public types are exported from the entry point shown in the
Imports section. Import root types from `@tolha/react` and server types from
`@tolha/react/server`.

### Rate-limit types

- `RateLimitConfig`: configuration for a rate limiter.
- `RateLimitStoreOptions`: window duration, maximum requests, and current timestamp passed to a store.
- `RateLimitStoreResult`: request count, reset timestamp, and whether the request was accepted.
- `RateLimitStore`: contract for custom rate-limit storage.
- `RateLimitResult`: result of checking a request.
- `RateLimitCheckOptions`: optional per-check namespace.
- `RateLimiter`: interface exposing the asynchronous `check()` method.

### Application-error types

- `ErrorPriority`: `"high" | "medium" | "low"`.
- `AppErrorPreset`: reusable error preset containing `code`, `message`, `status`, and `priority`, with optional `details`.
- `DefaultErrorKeys`: keys of `defaultErrorPreset`.
- `ErrorPresetKeys<P, IncludeDefaults>`: valid preset keys for a configured error class.
- `AppErrorOverrides`: partial error preset overrides with an optional native error `cause`.
- `ErrorConfigOptions<P, IncludeDefaults>`: configuration for `createAppError()`.
- `ErrorResponseBody`: standardized JSON error response body.

### User-agent types

- `UserAgentInfo`: complete parsed user-agent result.
- `UserAgentBrowserName`: recognized browser-name union.
- `UserAgentOSName`: recognized operating-system-name union.
- `UserAgentDeviceType`: device-category union.
- `UserAgentEngineName`: rendering-engine-name union.
- `UserAgentArchitecture`: CPU-architecture union.

---

## Runtime Requirements

- `UUID.random()` relies on `crypto.randomUUID()`, which requires a runtime that supports this API.
- IP, header, and user-agent utilities use the Fetch API `Request` type and return standard `Response` objects where applicable.
- Rate limiting uses `Map` and `Date.now()` in the default in-memory implementation.
- Error handling uses standard JavaScript `Error`, `Symbol`, and `Response` APIs.

Check your package's declared Node.js engine requirement and build target before publishing.

## Security

For security considerations, deployment guidance, and vulnerability reporting instructions, see the [Security Policy](../SECURITY.md).
