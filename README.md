# @tolha/react

A collection of reusable TypeScript utilities for request handling, error management, rate limiting, UUID operations, IP address extraction, and User-Agent parsing.

[![npm version](https://img.shields.io/npm/v/@tolha/react)](https://www.npmjs.com/package/@tolha/react)
[![npm downloads](https://img.shields.io/npm/dm/@tolha/react)](https://www.npmjs.com/package/@tolha/react)
[![License](https://img.shields.io/npm/l/@tolha/react)](./LICENSE)

## Features

- **UUID utilities** — Generate, validate, and extract timestamps from UUID-like values.
- **IP utilities** — Sanitize IP addresses and extract client IP information from requests.
- **Header utilities** — Read request headers from Fetch API `Headers` objects or compatible records.
- **User-Agent parsing** — Inspect browser, operating system, device, engine, architecture, and bot indicators.
- **Rate limiting** — Configure request limits with a built-in in-memory store or a custom store.
- **Error handling** — Create configurable application errors with HTTP status codes, error codes, and JSON responses.
- **TypeScript support** — Reusable types for configuration, results, and utility interfaces.

## Installation

Install the package using your preferred package manager:

```bash
npm install @tolha/react
```

```bash
pnpm add @tolha/react
```

```bash
yarn add @tolha/react
```

## Quick start

Import the utilities you need:

```ts
import {
  UUID,
  sanitizeIp,
  getHeader,
  getClientIp,
  getUserAgent,
  createRateLimiter,
  MemoryRateLimitStore,
  createAppError,
} from "@tolha/react";
```

The following examples demonstrate common use cases. For complete signatures, configuration options, and return types, see the [API Reference](./docs/API.md).

## UUID utilities

Use `UUID` to generate UUID values, validate them, and retrieve a timestamp when supported by the generated value.

```ts
import { UUID } from "@tolha/react";

const id = UUID.random();

const isValid = UUID.validate(id);

console.log({ id, isValid });
```

The utility also provides optional timestamp-related behavior:

```ts
import { UUID } from "@tolha/react";

const id = UUID.random(true);
const timestamp = UUID.getTime(id);

console.log(timestamp);
```

Review the documented timestamp format and validation behavior before using these values for expiration logic or security-sensitive identifiers.

## IP address utilities

### Sanitize an IP address

```ts
import { sanitizeIp } from "@tolha/react";

const ip = sanitizeIp("192.168.1.10");

if (ip !== null) {
  console.log("IP address:", ip);
}
```

`sanitizeIp()` returns a string when the input matches its supported IP patterns, or `null` otherwise.

### Get the client IP

```ts
import { getClientIp } from "@tolha/react";

export function handleRequest(request: Request) {
  const clientIp = getClientIp(request);

  return Response.json({ clientIp });
}
```

The utility checks available request IP information and supported headers. Forwarded headers must be handled according to your trusted-proxy configuration.

## Request header utilities

Use `getHeader()` to read a header from a request:

```ts
import { getHeader } from "@tolha/react";

export function handleRequest(request: Request) {
  const userAgent = getHeader(request, "user-agent");

  return Response.json({ userAgent });
}
```

The utility supports Fetch API `Headers` objects and compatible header records.

## User-Agent parsing

Use `getUserAgent()` to obtain structured information about a request's User-Agent.

```ts
import { getUserAgent } from "@tolha/react";

export function handleRequest(request: Request) {
  const userAgent = getUserAgent(request);

  return Response.json({
    browser: userAgent.browser.name,
    operatingSystem: userAgent.os.name,
    deviceType: userAgent.device.type,
    isBot: userAgent.isBot,
  });
}
```

The returned information includes browser, operating system, device, rendering engine, CPU architecture, and bot-detection indicators.

User-Agent parsing is heuristic. Do not use it as an authentication or authorization mechanism.

## Rate limiting

Create a rate limiter with a request window and maximum request count:

```ts
import { createRateLimiter, MemoryRateLimitStore } from "@tolha/react";

const rateLimiter = createRateLimiter(
  {
    windowMs: 60_000,
    maxRequests: 100,
    namespace: "api",
  },
  new MemoryRateLimitStore(),
);
```

Check whether an identifier is allowed to make a request:

```ts
const result = await rateLimiter.check("user-123");

if (result.limited) {
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
      },
    },
  );
}
```

The result includes the limit, remaining requests, reset time, and retry delay.

**Production note:** `MemoryRateLimitStore` keeps counters in the current process. For deployments with multiple instances or serverless execution, use a shared store that supports atomic request consumption.

See the [API Reference](./docs/API.md) for the store interface and configuration options.

## Application errors

Use `createAppError()` to create a configured application error class with reusable error presets.

```ts
import { createAppError } from "@tolha/react";

const AppError = createAppError();

throw new AppError("UNAUTHORIZED");
```

You can convert an error into an HTTP response:

```ts
import { createAppError } from "@tolha/react";

const AppError = createAppError();

try {
  throw new AppError("INVALID_REQUEST");
} catch (error) {
  return AppError.response(error);
}
```

The package also exports `ErrorResponse()` for producing a response directly from an error.

Configured errors support preset-based status codes, error codes, messages, priorities, optional details, and causes. Unexpected errors are handled with a generic internal-server-error response.

Only include details that are safe to disclose to clients.

## API reference

The complete API documentation is available in [`docs/API.md`](./docs/API.md).

It covers:

- Exported functions, classes, and types
- Parameters and return values
- Rate-limit configuration and custom stores
- Application error presets and response behavior
- UUID timestamp behavior
- Request headers, IP addresses, and User-Agent parsing

## TypeScript

The package provides TypeScript types for its documented APIs. Import the types directly from the package entry point when they are exported there.

Refer to [`docs/API.md`](./docs/API.md) for the available types and their definitions.

## Security

Security-sensitive behavior depends on how these utilities are configured and used in your application.

Read the [Security Policy](./SECURITY.md) for security considerations, supported versions, and vulnerability reporting instructions.

## Contributing

Contributions, bug reports, and improvements are welcome.

Before submitting a contribution, review the project's [Contributing Guide](./CONTRIBUTING.md), if available.

## Support

For questions, bugs, or feature requests, use the repository's GitHub Issues where appropriate.

Please do not publish sensitive vulnerability details in public issues. Follow the private reporting instructions in [`SECURITY.md`](./SECURITY.md).

## License

This project is licensed under the [MIT License](./LICENSE).
