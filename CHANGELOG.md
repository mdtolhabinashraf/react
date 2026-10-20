# Changelog

All notable changes to `@tolha/react` are documented here.

## [1.3.0] - 2026-10-20

### Added

- Exported `EndpointClient` and `EndpointClientError` from the package root.
- Added type-safe Apexa v2 endpoint client support for nested routes and shared
  paths with multiple HTTP methods.
- Exported `EndpointError` from `@tolha/react/server`.

### Changed

- Updated the Apexa runtime dependency to v2.
- Moved the endpoint client implementation to the package root utilities.
- Updated the API reference for the new client and error contracts.

### Validation

- TypeScript type-check passes.
- Test suite passes.
- Production build and npm package contents validate successfully.
