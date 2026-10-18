# Contributing

Thank you for considering a contribution to `@tolha/react`.

## Before opening an issue

- Search existing issues for the same bug or proposal.
- Include a minimal reproducible example for bug reports.
- Never include API keys, access tokens, cookies, or other secrets in reports.

## Development setup

1. Fork the repository and clone your fork.
2. Install the supported Node.js version.
3. Install dependencies with `npm install`.
4. Create a focused branch for your change.

## Quality checks

Before opening a pull request, run:

```bash
npm run typecheck
npm run test
npm run build
npm pack --dry-run
```

Run the test suite as well when available. Do not claim that a check passed unless it has actually been executed.

## Pull requests

- Keep changes focused and explain the motivation.
- Add or update tests for behavior changes.
- Update JSDoc and documentation for public API changes.
- Avoid introducing breaking changes without discussion.
- Ensure examples reflect the actual implementation.
- Never commit credentials, generated secrets, or private data.

## Reporting security issues

Do not disclose exploitable security issues in public issue trackers. Follow [SECURITY.md](./SECURITY.md).
