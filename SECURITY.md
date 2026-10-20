# Security Policy

This policy applies to `@tolha/react`, including the root package and the
`@tolha/react/server` entry point. The library provides reusable primitives;
the application integrating them remains responsible for authentication,
authorization, deployment hardening, and operational monitoring.

## Supported Versions

The latest published release is the only version targeted for security fixes.
The package currently requires Node.js 20 or newer.

Until the first stable release (`1.0.0`) is published, formal support commitments have not yet been established. Users are encouraged to upgrade to the latest available version.

| Version        | Supported                          |
| -------------- | ---------------------------------- |
| Latest release | Security fixes targeted            |
| Older releases | Not supported                      |

## Reporting a Vulnerability

Please do not disclose vulnerability details, exploit code, or sensitive security information in a public issue.

Report vulnerabilities privately using
[GitHub's private vulnerability reporting](https://github.com/mdtolhabinashraf/react/security/advisories/new),
if available for the repository. If that form is unavailable, contact the
maintainer privately through the contact options on the
[repository](https://github.com/mdtolhabinashraf/react); do not create a
public issue.

Include the following information when possible:

- **Affected version:** The package version, Git commit, or affected component.
- **Impact:** The potential security consequences and attack prerequisites.
- **Reproduction steps:** Minimal steps to reproduce the issue in a controlled environment.
- **Proof of concept:** A minimal example that demonstrates the vulnerability without exposing real systems or user data.
- **Suggested mitigation:** Any proposed fix or workaround, if known.

Do not include real credentials, private user data, production secrets, or other confidential information in your report.

Please allow maintainers reasonable time to investigate, develop a fix, and coordinate disclosure before publishing vulnerability details.

## Security Considerations

### Secrets and Environment Variables

- Never expose API keys, private tokens, database credentials, or other secrets in browser-side bundles.
- Keep server-only configuration and secrets on the server.
- Do not commit secrets to the repository.

### Rate Limiting

- `MemoryRateLimitStore` stores counters in the current process and is not suitable for reliable distributed rate limiting across multiple servers or serverless instances.
- Use a shared, persistent store for distributed deployments.
- Custom rate-limit stores must implement atomic request consumption to avoid race conditions.
- Choose appropriate limits and time windows for the protected operation.
- Rate limiting is not authentication. Apply it after identifying the
  relevant client or account and combine it with authorization controls.

### Endpoint Utilities and Request Bodies

- `EndpointDefinition.handle()` validates configured query and JSON body
  schemas, but it does not authenticate a request or authorize an operation.
- Run authentication and authorization middleware before sensitive handlers.
- Enforce request body-size limits in the framework, reverse proxy, or server
  adapter before parsing untrusted bodies. Zod validation does not limit body
  size.
- Treat context factories as trusted server-side code. Do not copy
  client-provided values into an authenticated context without verification.
- Endpoint errors are propagated to the caller. Server adapters must convert
  expected errors into safe responses and avoid exposing stack traces.
- Use `response.json`, `response.text`, and `response.html` only with content
  that is safe for the response context. Escape or sanitize untrusted values
  before embedding them in HTML.

### Client IP Address Handling

- Headers such as `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP` may be spoofed if they are not supplied or validated by a trusted proxy.
- Configure trusted proxies correctly before using client IP addresses for access control, rate limiting, or security decisions.
- Do not treat a parsed IP address as proof of a client's identity.

### User-Agent Parsing

- User-Agent strings are client-controlled and can be spoofed.
- Do not use User-Agent parsing as an authentication mechanism or as the sole basis for authorization or other security-critical decisions.

### Error Handling

- Avoid returning internal stack traces, database details, filesystem paths, credentials, or other sensitive implementation details to clients.
- Use generic error responses for unexpected server errors.
- Include error details in responses only when they are safe to disclose.
- `jsonErrorResponse()` intentionally replaces unexpected errors with a generic
  internal-server response. Preserve that behavior at framework boundaries.

### Input Validation

- Validate and sanitize untrusted input at application boundaries.
- Do not assume that parsing an IP address, request header, UUID, or other input establishes that the input is trustworthy.
- Apply application-specific validation and authorization checks where needed.
- Zod schemas validate shape and values; they do not make data trusted or
  prevent business-logic abuse.

### Dependency and Supply-Chain Hygiene

- Install the package from the official npm package and verify the package
  version before deployment.
- Keep `@tolha/react`, `zod`, Node.js, and the package manager updated within
  your compatibility requirements.
- Review lockfile changes before merging and run the repository's typecheck,
  build, and test commands after dependency updates.

## Scope

This policy covers security vulnerabilities in the `@tolha/react` package
itself, including its published utilities and documented behavior. It does
not guarantee the security of applications, middleware, reverse proxies,
custom rate-limit stores, or other services that consume the package.

Application-specific configuration, deployment infrastructure, and third-party services may require separate security reviews.

## Acknowledgments

We appreciate responsible security research and reports that help improve the safety and reliability of this project.
