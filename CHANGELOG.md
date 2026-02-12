# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Hardened Clawhub skill install flow to default to HTTPS repo cloning with optional `LEAK_REPO_URL` override.
- Added runtime command fallback in skill scripts: use `leak` on PATH first, then `npx -y leak-cli`.
- Replaced README Clawhub placeholder copy with concrete agent flow steps.
- Updated skill docs to reflect fallback behavior and HTTPS clone defaults.

## [2026.2.11]

### Added

- Initial npm release of `leak-cli`.
