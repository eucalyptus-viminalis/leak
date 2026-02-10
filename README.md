# paywall-node

Node (Express) implementation of an **x402 paywalled download**.

This mirrors the behavior of the Python scaffold in `~/paywall/paywall/server.py`:

- `GET /download` without payment → **402** with `PAYMENT-REQUIRED` header
- `GET /download` with valid payment headers → returns a **time-limited token** JSON
- `GET /download?token=...` → streams the artifact

## Setup

```bash
cd ~/paywall-node
cp .env.example .env
# edit .env (SELLER_PAY_TO, ARTIFACT_PATH, etc)

npm install
npm run dev
```

## Routes

- `GET /` info
- `GET /health` (free)
- `GET /download` (x402-protected)

## Env vars

- `FACILITATOR_URL` (default: https://x402.org/facilitator)
- `SELLER_PAY_TO` receiving address
- `PRICE_USD` (string like `1.00`)
- `CHAIN_ID` (default: `eip155:84532` Base Sepolia for `x402.org/facilitator`; use `eip155:8453` for Base mainnet with a mainnet-capable facilitator)
- `WINDOW_SECONDS` access token lifetime
- `CONFIRMATION_POLICY` = `optimistic` or `confirmed`
- `ARTIFACT_PATH` local file path

## Legacy header

This server will also accept legacy `X-PAYMENT` by aliasing it to `PAYMENT-SIGNATURE`.
