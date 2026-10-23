# Changelog

All notable changes to `@tolha/react` are documented here.

## [1.3.2] - 2026-10-23

### Changed

- Renamed `AppErrorPreset` to `ErrorPreset`.
- Renamed `AppErrorOverrides` to `ErrorOverrides`.
- Renamed `AppErrorResponse` to `ErrorResponse`.
- Renamed `isAppErrorPreset` to `isErrorPreset`.
- Renamed `isConfiguredAppError` to `isConfiguredError`.
- Renamed `AppError.get` to `AppError.from`.

## [1.3.1] - 2026-10-23

### Added

- Added `normalizeError` for safely normalizing unknown error-shaped values
  without requiring the application error brand.
- Added `AppError.normalize` and `AppError.get` helpers for normalized error
  representations.

### Changed

- `AppError.get` now only accepts branded errors created by the configured
  application error class.
- JSON error responses now include the HTTP `status` and error `priority`
  alongside `code` and `message`.
- Unknown or incomplete error values fall back to the internal-server preset.
- Updated the application error API documentation and test coverage.

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
