# leak

- `there is no platform\n<beautiful_milady.jpg>\ni love you`
- cutting-edge architecture with dial-up sensibilities
- "For a limited time only."

**Leak** is a content creator tool that can set up a time-boxed online store hosted straight from your computer. It leverages open source tools, the x402 protocol, and AI assistants (like OpenClaw) to make selling digital goods as easy as asking your agent about the weather. Leak is for fans too; buying content is easy as giving your agent the promo or download link shared by your favorite creators and funding your agent with USDC -- installing the leak skill makes all of this a breeze.

## Quick Start

### Install

```bash
npm i -g leak-cli
```

Package name: `leak-cli`

Command: `leak`

OpenClaw skill docs live in this repo at:
- [`/skills/leak-buy`](https://github.com/eucalyptus-viminalis/leak/tree/main/skills/leak-buy)
- [`/skills/leak-publish`](https://github.com/eucalyptus-viminalis/leak/tree/main/skills/leak-publish)

### Config

```bash
leak config
```

Configure defaults to avoid managing multiple flags when using leak subcommands.

Once `leak` is configured, commands become very simple to use:

**Selling**:

```bash
leak --file ./your-file.bin --public
```

**Buying**:

```bash
leak buy <promo_or_download_link> --buyer-private-key-file <path>
```

### Seller Quickstart 1: Local testnet sale (fastest path)

Goal: run a local sale and verify the x402 flow end to end.

Prereqs: fund a buyer test wallet on Base Sepolia ([Circle Faucet](https://faucet.circle.com)); no CDP mainnet setup is needed. 

```bash
leak --file ./your-file.bin --pay-to 0xYOUR_ADDRESS --price 0.01 --window 15m --network eip155:84532
```

Expected output:
- server URLs for `/`, `/health`, and `/download`
- `/download` is x402-protected

Verification:

```bash
curl -i http://127.0.0.1:4021/download
```

Expected result: `402` plus a `PAYMENT-REQUIRED` header.

### Seller Quickstart 2: Public testnet sale (shareable link)

Goal: create a public share link for social posting.

```bash
brew install cloudflared
```

```bash
leak --file ./your-file.bin --pay-to 0xYOUR_ADDRESS --price 0.01 --window 30m --network eip155:84532 --public --og-title "Your Release Title" --og-description "Limited release. Agent-assisted purchase."
```

Use the output URLs like this:
- share `https://<tunnel>/` as your promo URL (optimized for OpenGraph metadata on feeds and chats)
- agents will use `https://<tunnel>/download` to buy (x402-protected link)
- open the promo URL in a browser and confirm title, description, and image render correctly for social cards
- while the tunnel is still running, run the Buyer section below to validate payment + download end-to-end

### Buyer Skeleton (direct CLI)

Use the direct CLI buy flow:

```bash
leak buy "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key
```

`leak buy` accepts either the promo URL (`/`) or direct x402 URL (`/download`).
By default, the file is saved to your current directory using the server-provided filename; use `--out` or `--basename` to control naming.
When settlement metadata is returned, `leak buy` also prints a receipt block with network + transaction hash (and Basescan link on Base networks).

Security note: use a dedicated buyer key with limited funds.

### Buyer Skeleton (Clawhub skill flow)

- install the `leak-buy` skill from Clawhub
- give your agent the promo URL (`/`) from the post (or `/download`)
- provide a funded buyer key when prompted
- let the agent complete payment + download through the skill

The hardened skills require a preinstalled `leak` binary on PATH.

Recommended first-time agent UX for unknown URLs:
- ask only for skill-install approval (`clawhub install leak-buy`)
- ask for an existing buyer key file path
- run: `bash skills/leak-buy/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file <buyer_key_file_path>`
- avoid protocol deep-dives unless the user explicitly asks for x402 internals

### Next: Mainnet checklist (optional)

Warning: switching only `CHAIN_ID` to mainnet is not sufficient.

Required:
- `FACILITATOR_MODE=cdp_mainnet`
- `CHAIN_ID=eip155:8453`
- `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`
- recommended: `CONFIRMATION_POLICY=confirmed`

Reference: see [Testnet vs Mainnet facilitator setup](#testnet-vs-mainnet-facilitator-setup) below.

---

## User Archetypes

**Seller**:
- publish payment-gated content straight from your computer
  - set your own price 💸
  - set available window 🪟
  - tell your agent what you b *leakin'* 🤤
- `💦 on-demand + one-shot + ephemeral ✨ -- store for your digital goods`
- yes, install `leak-publish` (seller) and `leak-buy` (buyer) OpenClaw skills and let your agent run those flows 🪬

**Buyer**:
- download cool sh!t straight to your device
  - skip the bad 🤓 guys 😤
  - NO MORE SUBSCRIPTIONS PLEASE (hehe)
  - platform resi-. there is not platform, i love you.

**U MAD?**:
- Spotify
- OnlyFans
- BandCamp
- SoundCloud

## Leak CLI (recommended)

The easiest way to run the server is the `leak` CLI, which prompts for missing info (price + duration) and auto-stops after the sale window (or `window + ended-window`, if configured).

```bash
cd ~/leak
npm run leak -- --file /path/to/vape.jpg
```

If you install this package globally / as a dependency, you can run:

```bash
leak --file /path/to/vape.jpg
```

Backward-compatible form still supported:

```bash
leak leak --file /path/to/vape.jpg
```

It will ask:
- **How much (USDC)?** (e.g. `0.01`)
- **How long?** (e.g. `15m`, `1h`)

Optional flags:
- `--price 0.01` (USDC)
- `--window 1h` (or seconds)
- `--confirmed` (settle on-chain before issuing token)
- `--public` (start a temporary Cloudflare Tunnel and print a public URL; requires `cloudflared`)
- `--og-title "My Drop"`
- `--og-description "Agent-assisted purchase"`
- `--og-image-url https://...` (absolute `http(s)` URL) or `--og-image-url ./cover.png` (local image path)
- `--ended-window-seconds 86400` (keep ended promo page online before auto-stop)
- `--network eip155:84532`
- `--pay-to 0x...` (must be a valid Ethereum address)
- `--port 4021`

### Persistent config (`leak config`)

To avoid passing the same seller/facilitator flags every run, configure defaults once:

```bash
leak config
```

Inspect saved values (secrets redacted):

```bash
leak config show
```

Optionally scaffold a project `.env` from saved defaults:

```bash
leak config --write-env
```

Config file location:
- `~/.leak/config.json`

Precedence for launch values:
- CLI flags
- environment variables
- `~/.leak/config.json`
- built-in defaults

Manual editing is supported. Keep `CDP_API_KEY_SECRET` private and avoid committing generated `.env` files.

### Install `cloudflared` for `--public`

`--public` needs the Cloudflare Tunnel binary on your PATH.

```bash
# macOS (Homebrew)
brew install cloudflared

# Windows (winget)
winget install --id Cloudflare.cloudflared
```

Linux packages/docs:
`https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`

If you don't need a public URL, run without `--public` for local-only mode.

For now, Cloudflare quick tunnel (`--public`) is supported for both dev and early production rollout.
Custom-domain ingress can be added later.

### Tweeting/sharing a release

When using `--public`, share the **promo URL** (`/`) in your tweet/chat message.

- `https://<tunnel>/` → promo page with OG/Twitter card metadata
- `https://<tunnel>/download` → x402 endpoint for agents

Example:

```bash
npm run leak -- --file ./song.mp3 --pay-to 0x... --price 1 --window 1h --public \
  --og-title "New Single: Nightwire" \
  --og-description "Limited release. Agent-assisted purchase." \
  --og-image-url ./nightwire-cover.jpg
```

When a local image path is used for `--og-image-url`, leak serves it from `/og-image` and points OG/Twitter metadata at that endpoint.
Without `--og-image-url`, leak serves a generated raster OG card from `/og.png` (and keeps `/og.svg` for debug/backward compatibility).

This mirrors the behavior of the original Python scaffold implementation:

- `GET /download` without payment → **402** with `PAYMENT-REQUIRED` header
- `GET /download` with valid payment headers → returns a **time-limited token** JSON
- `GET /download?token=...` → streams the artifact

### Testnet vs Mainnet facilitator setup

`CHAIN_ID=eip155:8453` by itself is **not enough** for production.

Base Sepolia / testnet:

```bash
FACILITATOR_MODE=testnet
FACILITATOR_URL=https://x402.org/facilitator
CHAIN_ID=eip155:84532
```

Base mainnet (CDP facilitator auth required):

```bash
FACILITATOR_MODE=cdp_mainnet
FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
CHAIN_ID=eip155:8453
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
```

Recommended for production-like behavior:

```bash
CONFIRMATION_POLICY=confirmed
```

---

## Quickstart (local)

### 1) Install

```bash
cd ~/leak
npm install
```

### 2) Configure

```bash
cp .env.example .env
# edit .env
```

Minimum you must set:
- `SELLER_PAY_TO` (the address that receives USDC; must be a valid Ethereum address)
- `ARTIFACT_PATH` (the file you want to serve)

Example artifact:
```bash
mkdir -p protected
printf "hello" > protected/asset.bin
# then set ARTIFACT_PATH=./protected/asset.bin
```

### 3) Run

Dev (auto-reload):
```bash
npm run dev
```

Prod:
```bash
npm start
```

Server will print:
- `http://localhost:4021/` (promo page)
- `http://localhost:4021/info` (machine-readable info)
- `http://localhost:4021/health`
- `http://localhost:4021/download` (x402-protected)

---

## How the flow works

### A) Unpaid request

```bash
curl -i http://localhost:4021/download
```

You should get `402` and a `PAYMENT-REQUIRED` header.

### B) Paid request → token

A buyer/agent should retry with a payment header:
- v2: `PAYMENT-SIGNATURE: <base64-json>`
- legacy: `X-PAYMENT: <base64-json>` (accepted by this server)

If valid, the server responds `200` JSON:
```json
{
  "ok": true,
  "token": "...",
  "expires_in": 3600,
  "download_url": "/download?token=...",
  "filename": "myfile.mp3",
  "mime_type": "audio/mpeg"
}
```

#### Node buyer test script

There’s a Node buyer test script that does the whole 3-step flow (402 → pay → token → download).

## Buyer CLI (new)

There is now a proper buyer CLI that takes the link directly (no `BASE_URL` env):

```bash
leak buy "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key
```

When available, it prints payment receipt metadata including transaction hash and network before saving the file.

Optional save naming:
- `--out ./some/path.ext`
- `--basename myname` (keeps the server file extension)

```bash
cd ~/leak

# buyer envs (REQUIRED)
export BASE_URL=https://xxxx.trycloudflare.com   # or http://127.0.0.1:4021 in dev
export BUYER_PRIVATE_KEY=0x...

# optional
export OUTPUT_PATH=./downloaded.bin
export OUTPUT_BASENAME=myfilename

npm run buyer
```

Dev convenience (optional):
```bash
export LEAK_DEV=1   # allows BASE_URL to default to http://127.0.0.1:4021
```

What it does:
- first `GET /download` expects **402** + `PAYMENT-REQUIRED`
- creates a payment payload, retries with `PAYMENT-SIGNATURE`
- receives `{ token, download_url, filename, mime_type }`
- downloads via `?token=` and saves to disk

### C) Use token → download

```bash
curl -L -o out.bin "http://localhost:4021/download?token=..."
```

---

## Routes

- `GET /` promo HTML page with OG/Twitter tags
  - `200` while sale is active
  - `200` once sale has ended (ended state is shown in page content/metadata)
- `GET|HEAD /.well-known/skills/index.json` RFC skill discovery index
- `GET|HEAD /.well-known/skills/leak/SKILL.md` RFC skill metadata markdown
- `GET|HEAD /.well-known/skills/leak/resource.json` RFC sale/resource metadata (`200` live, `410` ended)
- `GET /.well-known/leak` legacy discovery endpoint (backward-compatible)
- `GET /info` machine-readable JSON status (compat endpoint)
- `GET|HEAD /og-image` configured OG image file (when using local `--og-image-url` path)
- `GET|HEAD /og.png` generated default OG image (used when `--og-image-url` is not set)
- `GET|HEAD /og.svg` debug/backward-compatible OG SVG
- `GET /health` free health check
- `GET /download` x402-protected download endpoint
  - active sale: normal x402/token flow
  - ended sale: `410`

---

## Troubleshooting

- **`Invalid seller payout address`** → set `--pay-to` / `SELLER_PAY_TO` to a valid Ethereum address (`0x` + 40 hex chars).
- **Farcaster/Warpcast preview missing OG image** → prefer PNG/JPG (`--og-image-url` or default `/og.png`), ensure OG URLs are absolute `https://` (set `PUBLIC_BASE_URL` if needed), and re-share with a fresh URL variant (example: `/?v=2`) to bypass crawler cache.

---

## Env vars

- `PORT` (default `4021`)
- `FACILITATOR_MODE`
  - `testnet` (default)
  - `cdp_mainnet` (required for Base mainnet path in this project)
- `FACILITATOR_URL`
  - default with `FACILITATOR_MODE=testnet`: `https://x402.org/facilitator`
  - default with `FACILITATOR_MODE=cdp_mainnet`: `https://api.cdp.coinbase.com/platform/v2/x402`
- `SELLER_PAY_TO` receiving address (valid Ethereum address, `0x` + 40 hex chars)
- `PRICE_USD` (string like `1.00`)
- `CHAIN_ID`
  - default: `eip155:84532` (Base Sepolia) for `x402.org/facilitator`
  - Base mainnet: `eip155:8453` (requires `FACILITATOR_MODE=cdp_mainnet` plus CDP keys)
- `CDP_API_KEY_ID` (required with `FACILITATOR_MODE=cdp_mainnet`)
- `CDP_API_KEY_SECRET` (required with `FACILITATOR_MODE=cdp_mainnet`)
- `WINDOW_SECONDS` access token lifetime
- `SALE_START_TS` sale start (unix seconds; usually set by launcher)
- `SALE_END_TS` sale end (unix seconds; usually set by launcher)
- `ENDED_WINDOW_SECONDS`
  - `--public` default in launcher: `86400` (24h)
  - local-only default in launcher: `0`
- `CONFIRMATION_POLICY`
  - `confirmed` (default): settles via facilitator before issuing token (you should be able to see a tx on Basescan)
  - `optimistic`: verifies payment + issues token, but may not settle on-chain
- `CONFIRMATIONS_REQUIRED` (currently informational; parity with Python scaffold)
- `ARTIFACT_PATH` local file path
- `PROTECTED_MIME` content type (default `application/octet-stream`)
- `OG_TITLE` optional card/page title (or use `--og-title`)
- `OG_DESCRIPTION` optional card/page description (or use `--og-description`)
- `OG_IMAGE_URL` optional absolute `http(s)` card image URL (or use `--og-image-url`)
- `OG_IMAGE_PATH` optional local card image file path (set automatically by launcher when using local `--og-image-url`)
- `PUBLIC_BASE_URL` optional absolute base URL for metadata canonicalization

---

## Versioning

This package uses **CalVer** in `YYYY.M.P` format (example: `2026.2.11`).

Release rules:
- `YYYY` = year
- `M` = month
- `P` = release number within that month
- Pre-release builds use semver-compatible tags, for example `2026.2.11-rc.1`.

---

## Maintainer Release Process

- Run local release preflight:
  - `npm run check:release`
- Use `beta` dist-tag before promoting to `latest`:
  - `npm publish --tag beta`
  - `npm dist-tag add leak-cli@<version> latest`
- Keep versions synchronized:
  - `package.json`
  - `skills/leak/SKILL.md`
  - `skills/leak-buy/SKILL.md`
  - `skills/leak-publish/SKILL.md`
- Ensure `CHANGELOG.md` has a section for the stable release version before tagging.
- Use tag format `v<version>` for stable GitHub releases.

Maintainer references:
- `RELEASE.md` (weekly lifecycle + release checklist)
- `CONTRIBUTING.md` (PR/release expectations)
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

---

## Notes

### Legacy header support

This server accepts legacy `X-PAYMENT` by aliasing it to `PAYMENT-SIGNATURE`.

### Running under OpenClaw / timeouts

If you see a `SIGKILL` after “listening …”, it usually means the command was run with a short timeout during automated testing. Running via `npm run dev` in your own terminal will keep it alive.

### Facilitator troubleshooting

- Startup error mentions `does not support scheme` or network mismatch:
  - your `CHAIN_ID` and facilitator mode/url are misaligned.
  - verify testnet vs mainnet settings above.

- Startup or runtime error mentions `401`, `403`, `authorization`, or `jwt`:
  - facilitator auth is missing/invalid.
  - for mainnet, ensure `FACILITATOR_MODE=cdp_mainnet` plus valid `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`.
