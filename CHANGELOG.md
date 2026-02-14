# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Added an explicit buyer fast-path contract across discovery surfaces so unknown agents can complete the leak buy flow with concise guidance:
  - promo page (`/`) now includes an "Agent Quick Path" block
  - unpaid `GET /download` responses now include HTML fast-path instructions while preserving `402` + `PAYMENT-REQUIRED`
  - RFC skill markdown (`/.well-known/skills/leak/SKILL.md`) now includes install-once + key-file default flow guidance
- Updated `skills/leak/SKILL.md` and README buyer flow docs to require short, execution-first responses and defer x402 protocol deep-dives unless explicitly requested.
- Updated buyer skill policy to allow explicit opt-in key creation fallback:
  - default remains existing key-file flow
  - on user request, agent may generate `./.leak/buyer.key` with owner-only permissions
  - when in a git workspace, agent should add `./.leak/buyer.key` to `.gitignore` idempotently

## [2026.2.15-beta.0]

### Changed

- Hardened buyer key handling:
  - removed support for `--buyer-private-key` command-argument input
  - added `--buyer-private-key-file` and `--buyer-private-key-stdin`
- Added seller publish safety gates in `leak` CLI:
  - artifact must be a regular file (directories/symlinks rejected)
  - sensitive-path blocking by default with explicit dual-flag override
  - required public exposure confirmation (`--public-confirm I_UNDERSTAND_PUBLIC_EXPOSURE` for non-interactive mode)
- Removed auto-install/git-clone skill fallback flow and switched skill helper scripts to runtime resolution only:
  - use local `leak` binary when available
  - else pinned `npx -y leak-cli@2026.2.14`
  - removed `skills/leak/scripts/ensure_leak.sh`
- Updated `skills/leak/SKILL.md` with explicit safety policy and secure key-handling instructions.
- Updated buyer-facing docs and discovery snippets to use secure key inputs (`--buyer-private-key-file` / `--buyer-private-key-stdin`) instead of raw key args.
- Reworked `RELEASE.md` into an event-driven, beta-first runbook with clear same-day prerelease steps and stable promotion flow.
- Updated `scripts/check_version_sync.js` to accept prerelease versions (`YYYY.M.P-beta.N`) in addition to stable versions (`YYYY.M.P`).

## [2026.2.14]

### Added

- Added RFC-style skill discovery endpoints:
  - `/.well-known/skills/index.json`
  - `/.well-known/skills/leak/SKILL.md`
  - `/.well-known/skills/leak/resource.json`
- Added legacy discovery deprecation hints in `/.well-known/leak` responses.
- Added release automation and policy files:
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `.github/CODEOWNERS`
  - `.github/pull_request_template.md`
  - `.github/release.yml`
  - `.github/release-template.md`
  - `CONTRIBUTING.md`
  - `RELEASE.md`
- Added release guard scripts:
  - `scripts/check_version_sync.js`
  - `scripts/check_changelog_version.js`
  - `scripts/check_no_local_paths.js`

### Changed

- Updated buy flow to accept promo URLs (`/`) in addition to `/download`, with discovery fallback and same-origin download URL enforcement.
- Improved JSON-LD on promo page to schema-valid `Product` + `Offer` shape and added script-safe JSON escaping.
- Enforced seller payout address validation (`viem` `isAddress`) across:
  - `leak` launch
  - `leak config` wizard
  - server boot (`SELLER_PAY_TO`/`PAY_TO`)
- Improved seller/share UX messaging:
  - publish scripts now print promo + buy links clearly
  - docs/skill guidance now prefers sharing promo URL and supports buy from promo or `/download`
- Added npm scripts for release gates and smoke checks:
  - `check:version-sync`
  - `check:changelog-version`
  - `check:no-local-paths`
  - `check:syntax`
  - `check:smoke`
  - `check:release`
  - `release:beta`
  - `release:latest`
- Updated release workflow behavior so tag pushes do not auto-publish to npm when running manual publish mode.
- Hardened Clawhub skill install flow to default to HTTPS repo cloning with optional `LEAK_REPO_URL` override.
- Added runtime command fallback in skill scripts: use `leak` on PATH first, then `npx -y leak-cli`.
- Replaced README Clawhub placeholder copy with concrete agent flow steps.
- Updated skill docs to reflect fallback behavior and HTTPS clone defaults.

## [2026.2.11]

### Added

- Initial npm release of `leak-cli`.
