# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
