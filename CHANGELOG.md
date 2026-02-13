# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

### Changed

- Added npm scripts for release gates and smoke checks:
  - `check:version-sync`
  - `check:changelog-version`
  - `check:syntax`
  - `check:smoke`
  - `check:release`
  - `release:beta`
  - `release:latest`
- Hardened Clawhub skill install flow to default to HTTPS repo cloning with optional `LEAK_REPO_URL` override.
- Added runtime command fallback in skill scripts: use `leak` on PATH first, then `npx -y leak-cli`.
- Replaced README Clawhub placeholder copy with concrete agent flow steps.
- Updated skill docs to reflect fallback behavior and HTTPS clone defaults.

## [2026.2.11]

### Added

- Initial npm release of `leak-cli`.
