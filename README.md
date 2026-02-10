# leak

Node (Express) implementation of an **x402 paywalled download** ("leak").

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

```bash
cd ~/leak

# buyer envs
export BASE_URL=http://127.0.0.1:4021
export BUYER_PRIVATE_KEY=0x...

# optional (defaults to server-provided filename)
export OUTPUT_PATH=./downloaded.bin

npm run buyer
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
  - `optimistic` (default): verifies payment + issues token, but may not settle on-chain
  - `confirmed`: settles via facilitator before issuing token (you should be able to see a tx on Basescan)
- `CONFIRMATIONS_REQUIRED` (currently informational; parity with Python scaffold)
- `ARTIFACT_PATH` local file path
- `PROTECTED_MIME` content type (default `application/octet-stream`)

---

## Notes

### Legacy header support

This server accepts legacy `X-PAYMENT` by aliasing it to `PAYMENT-SIGNATURE`.

### Running under OpenClaw / timeouts

If you see a `SIGKILL` after “listening …”, it usually means the command was run with a short timeout during automated testing. Running via `npm run dev` in your own terminal will keep it alive.
