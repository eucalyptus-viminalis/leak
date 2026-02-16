# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Added new access-mode model with explicit download-code terminology across CLI, config, env, and server runtime:
  - `no-download-code-no-payment`
  - `download-code-only-no-payment`
  - `payment-only-no-download-code` (default)
  - `download-code-and-payment`
- Replaced legacy access-secret wording with `download-code` terminology across publish/buy/runtime/docs.
- Added secure hash-only download-code handling:
  - launcher hashes raw download-code input before boot (`DOWNLOAD_CODE_HASH`)
  - server validates download-code using timing-safe `scrypt` hash comparison
  - no raw download-code persistence in config or env defaults.
- Added `/download` gate ordering and mode behavior:
  - download-code check first (`401` on missing/invalid)
  - x402 payment check second when enabled (`402` flow unchanged)
  - no-payment modes stream artifact directly without x402 handshake.
- Added buyer CLI support for `--download-code` and `--download-code-stdin`, with payment flow now conditional on receiving a `402` challenge.
- Added CI/release terminology audit (`check:download-code-terminology`) to fail builds if banned legacy access-secret wording appears in user-facing surfaces.
- Improved top-level CLI UX with clearer grouped help output and examples.
- Added CLI version checks via both `leak version` and `leak --version`.
- Added interactive publish wizard via `leak publish`:
  - basic step for core publish inputs
  - optional advanced step for facilitator/port/OG settings
  - mandatory final confirmation before launch
  - optional save-defaults prompt for `~/.leak/config.json`
- Improved `leak publish` wizard input UX:
  - `FILE_PATH` prompt now supports Tab autocomplete for local paths
  - `~` home-directory paths now resolve correctly (for example `~/Downloads/file.txt`)
  - fixed post-access-mode prompt stability so PRICE/WINDOW/payment prompts do not exit early
- Polished CLI output presentation across `leak`, `leak publish`, `leak buy`, and `leak config`:
  - added consistent section spacing and key/value summary layouts
  - added subtle ANSI styling for interactive terminals
  - added ASCII status labels (`[info]`, `[ok]`, `[warn]`, `[error]`)
  - honors `NO_COLOR=1` and disables color in non-TTY contexts
  - publish output now emits clickable terminal hyperlinks for public/promo/buy URLs when supported

## [2026.2.17-beta.1]

### Changed

- Hard-switched agent discovery and promo-page install guidance from `leak` to `leak-buy`:
  - `SKILL_NAME` for well-known discovery is now `leak-buy`
  - install command shown to agents is now `clawhub install leak-buy`
- Updated `/.well-known/leak` legacy discovery payload to advertise `leak-buy` for compatibility with old endpoint consumers.
- Removed stale promo/discovery references to legacy skill helper paths under `skills/leak/scripts`.
- Discovery route behavior is now explicit:
  - active: `/.well-known/skills/leak-buy/SKILL.md` and `/.well-known/skills/leak-buy/resource.json`
  - legacy `/.well-known/skills/leak/*` paths are no longer served (hard switch).
- Hardened `leak-buy` command safety against shell-injection-style misuse:
  - validates promo/download URL shape (`http(s)` only; rejects whitespace/control chars)
  - validates buyer key file path (non-empty, no whitespace/control chars, not symlink)
  - requires buyer key path to resolve to an existing readable regular file
- Tightened `skills/leak-buy/SKILL.md` execution guidance:
  - requires tokenized/quoted argv construction (no raw interpolation, no `eval`, no `sh -c`)
  - replaced placeholder command examples with safe variable-based command forms.

## [2026.2.17-beta.0]

### Changed

- Hardened Clawhub/OpenClaw skill model by splitting legacy mixed skill into scoped skills:
  - `skills/leak-buy` (buy/download only)
  - `skills/leak-publish` (publish/sell only)
  - `skills/leak` is now a compatibility migration stub.
- Removed runtime dynamic package execution from skill helper scripts:
  - no `npx -y` fallback in buy/publish skill scripts
  - skill scripts now require preinstalled `leak` on PATH.
- Tightened buyer key handling in `leak-buy` skill:
  - only `--buyer-private-key-file` is allowed
  - blocked `--buyer-private-key` and `--buyer-private-key-stdin`
  - removed key-generation guidance from skill flow.
- Tightened publish path safety in `leak-publish` script:
  - rejects symlinks, directories, and non-regular files
  - blocks sensitive file roots (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gcloud`, `/etc`, `/proc`, `/sys`, `/var/run/secrets`)
  - kept persistent detached supervisor order (`systemd --user`, `launchd`, `tmux`, `screen`, `nohup`).
- Added repository guardrails for skill security:
  - new `scripts/check_skill_security.sh`
  - new npm script `check:skill-security`
  - CI now runs `check:skill-security`
  - version sync check now validates all `skills/*/SKILL.md` files against `package.json`.

## [2026.2.16]

### Changed

- Improved social card reliability for promo links (including Farcaster/Warpcast):
  - default OG fallback image now uses generated raster PNG (`/og.png`) instead of SVG
  - promo page now emits richer OG/Twitter image metadata (`og:image:secure_url`, type, dimensions, alt text)
  - app now trusts proxy headers for canonical HTTPS metadata behind tunnel/proxy setups
  - promo route (`GET /`) now returns `200` even after sale end so crawlers can still build previews
- Added `HEAD` support for OG image endpoints (`/og.png`, `/og.svg`, `/og-image`) to improve crawler compatibility.
- Updated README route and troubleshooting docs for OG preview behavior, including cache-busting guidance for refreshed link cards.
- Updated unpaid browser handling for `GET /download` (`402`) to render leak’s custom guidance page while preserving x402 protocol headers (`PAYMENT-REQUIRED`) and existing API behavior.
- Unified promo and guidance-page body content by sharing the same details block (price/network/sale-end, Agent Quick Path, human action copy-link, and install note), keeping `/` and unpaid `/download` views in sync.

## [2026.2.15]

### Added

- Added centralized chain metadata helpers in `src/chain_meta.js` to parse CAIP-2 identifiers and enforce supported networks (Base mainnet + Base Sepolia).
- Added promo-page localization for sale end timestamps so end users see the deadline in local time.

### Changed

- Enforced supported-chain validation across runtime surfaces:
  - `leak` launch now validates `--network` / `CHAIN_ID` and exits on invalid or unsupported values
  - `leak config` wizard now validates `CHAIN_ID` input and re-prompts until valid
  - server boot now validates chain configuration before starting
- Updated promo and OG presentation to use normalized chain display names and concise pricing copy.
- Updated leak skill runtime requirements to explicitly require both `node` and `leak`.
- Clarified x402 buyer funding policy in `skills/leak/SKILL.md`:
  - follow the token/amount returned by the `402 Payment Required` response
  - do not proactively require unrelated gas assets for standard flow unless an explicit gas error occurs
- Expanded release runbook with an explicit Clawhub prerelease/beta publish command.

## [2026.2.15-beta.1]

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
