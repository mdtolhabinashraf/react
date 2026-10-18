# Security Policy

## Supported Versions

Security fixes are intended for the latest supported release.

Until the first stable release (`1.0.0`) is published, formal support commitments have not yet been established. Users are encouraged to upgrade to the latest available version.

| Version        | Supported                          |
| -------------- | ---------------------------------- |
| Latest release | Intended to receive security fixes |
| Older releases | Not guaranteed                     |

## Reporting a Vulnerability

Please do not disclose vulnerability details, exploit code, or sensitive security information in a public issue.

Report vulnerabilities privately through the security contact configured in this repository or its hosting platform. If GitHub Private Vulnerability Reporting is enabled, you can use the repository's **Security** tab to submit a report.

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

### Input Validation

- Validate and sanitize untrusted input at application boundaries.
- Do not assume that parsing an IP address, request header, UUID, or other input establishes that the input is trustworthy.
- Apply application-specific validation and authorization checks where needed.

## Scope

This policy covers security vulnerabilities in the `@tolha/react` package itself, including its published utilities and their documented behavior.

Application-specific configuration, deployment infrastructure, and third-party services may require separate security reviews.

## Acknowledgments

We appreciate responsible security research and reports that help improve the safety and reliability of this project.
