# Contributing

## Workflow

- Open a PR against `main`.
- Keep changes focused and include user-facing docs updates when behavior changes.
- Update `CHANGELOG.md` under `[Unreleased]` for notable changes.
- Do not commit machine-specific absolute paths (for example `/Users/...`, `/home/...`, `C:\\Users\\...`); use repo-relative commands or placeholders.

## Required PR Checks

- `npm run check:version-sync`
- `npm run check:syntax`
- `npm run check:smoke`
- `npm pack --dry-run`

## Release Expectations

- Version parity is required between:
  - `package.json`
  - `skills/leak/SKILL.md`
- Version format must be `YYYY.M.P`.
- Every stable npm release must have:
  - a matching git tag (`v<version>`)
  - a GitHub Release
  - synchronized skill version metadata

## Manual Repo Settings (GitHub UI)

Configure branch protection for `main`:
- Require pull request reviews
- Require status checks to pass before merging
- Require linear history

## Publisher Security

- Enable npm account 2FA for publish/settings.
- Prefer npm Trusted Publishing (OIDC) for GitHub Actions releases.
- If using npm tokens, use least-privilege automation tokens and rotate regularly.

## Full Release Runbook

See `RELEASE.md` for the weekly beta -> stable lifecycle and command checklist.
