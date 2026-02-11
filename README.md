# leak

Node (Express) implementation of an **x402 paywalled download** ("leak").

## Leak CLI (recommended)

The easiest way to run the server is the `leak` CLI, which will prompt you for missing info (price + duration) and auto-stop the server when the window expires.

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
- `--network eip155:84532`
- `--pay-to 0x...`
- `--port 4021`

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

This mirrors the behavior of the Python scaffold in `~/paywall/paywall/server.py`:

- `GET /download` without payment → **402** with `PAYMENT-REQUIRED` header
- `GET /download` with valid payment headers → returns a **time-limited token** JSON
- `GET /download?token=...` → streams the artifact

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
- `SELLER_PAY_TO` (the address that receives USDC)
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
- `http://localhost:4021/` (info)
- `http://localhost:4021/health`
- `http://localhost:4021/download`

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
leak buy "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x...
```

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

- `GET /` info
- `GET /health` (free)
- `GET /download` (x402-protected)

---

## Env vars

- `PORT` (default `4021`)
- `FACILITATOR_URL` (default: `https://x402.org/facilitator`)
- `SELLER_PAY_TO` receiving address
- `PRICE_USD` (string like `1.00`)
- `CHAIN_ID`
  - default: `eip155:84532` (Base Sepolia) for `x402.org/facilitator`
  - for Base mainnet: `eip155:8453` (requires a mainnet-capable facilitator)
- `WINDOW_SECONDS` access token lifetime
- `CONFIRMATION_POLICY`
  - `confirmed` (default): settles via facilitator before issuing token (you should be able to see a tx on Basescan)
  - `optimistic`: verifies payment + issues token, but may not settle on-chain
- `CONFIRMATIONS_REQUIRED` (currently informational; parity with Python scaffold)
- `ARTIFACT_PATH` local file path
- `PROTECTED_MIME` content type (default `application/octet-stream`)

---

## Versioning

This package uses **CalVer** in `YYYY.M.P` format (example: `2026.2.11`).

Release rules:
- `YYYY` = year
- `M` = month
- `P` = release number within that month
- Pre-release builds use semver-compatible tags, for example `2026.2.11-rc.1`.

---

## Notes

### Legacy header support

This server accepts legacy `X-PAYMENT` by aliasing it to `PAYMENT-SIGNATURE`.

### Running under OpenClaw / timeouts

If you see a `SIGKILL` after “listening …”, it usually means the command was run with a short timeout during automated testing. Running via `npm run dev` in your own terminal will keep it alive.
