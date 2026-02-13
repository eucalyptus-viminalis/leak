---
name: leak
description: Sell or buy x402-gated digital content using the leak CLI tool. On the seller side, use this skill when the user wants to publish, release, or "leak" a file and wants to charge a price. On the buyer side, use this when the user wants to download a file that requires payment.
compatibility: Requires access to the internet
version: 2026.2.11
metadata:
  openclaw:
    emoji: 💦
    os: ["darwin", "linux"]
    requires:
      env:
      bins: ["leak"]
    install:
      - kind: node
        package: leak-cli
        bins: ["leak"]
        label: "Install leak-cli via npm"
    primaryEnv:
  author: eucalyptus-viminalis
---

# leak

## Overview

This skill operates the `leak` CLI tool:
- **Publish** a file behind an x402 `402 Payment Required` gate and mint a time-limited token after payment.
- **Share** `/` as the promo URL (social-card friendly) and use `/download` for the purchase flow.
- **Buy** from either a promo URL (`/`) or x402 URL (`/download`) and save the artifact locally.

## Terminology Guide

- Terms `content`, `file`, `artifact`, `media`, `digital good` can be used interchangeably to refer to some kind of digital file in any format; `.mp3`, `.zip`, `.png`, `.md`, etc.
- Terms `publish`, `release`, `sell`, `leak`, `drop`, `serve` can be used interchangeably to refer to the act of booting up a server from this host machine to serve a digital file to the internet with an x402-gated download link.

## Install / ensure CLI exists (first step)

Prefer the `leak` CLI on PATH. If missing, install it globally from npm first:

```bash
npm i -g leak-cli
```

If that fails or you need a dev checkout, use the `scripts/ensure_leak.sh` fallback:

Run:

```bash
bash scripts/ensure_leak.sh
```

Notes:
- Tries `npm i -g leak-cli` first.
- Fallback installs into `~/leak` (clones if missing over HTTPS), then runs `npm install` and `npm link`.
- Clone source can be overridden with `LEAK_REPO_URL=...`.
- Helper scripts run `leak` when available, otherwise they fall back to `npx -y leak-cli`.

## Publish content (server)

Activate when the user says things like:
- "publish this"
- "share this file"
- "make this downloadable"
- "leak this"

Preferred: use the helper script, which ensures install and prints a clear share link.

### Interactive flow (recommended)

When the user wants to publish, guide them through:
1. **File**: Which file or folder?
2. **Price**: How much USDC? (e.g., 0.01, 1.00)
3. **Duration**: How long? (15m, 1h, 6h, 24h)
4. **Public**: Do you want a public link? (requires cloudflared)
5. **Pay-to address**: Where should payments go? (must be a valid Ethereum address)

Then run the publish command and provide both promo + buy URLs, with promo URL as the default share URL.

### Local-only (good for a trial run)

Only use this method for testing purposes; use this when the user wants to test how the server will function before exposing it to the public.

```bash
bash scripts/publish.sh \
  --file /absolute/or/relative/path/to/file \
  --price 0.01 \
  --window 15m \
  --pay-to 0xSELLER_ADDRESS \
  --network eip155:84532
```

Direct CLI equivalent:

```bash
leak \
  --file /absolute/or/relative/path/to/file \
  --price 0.01 \
  --window 15m \
  --pay-to 0xSELLER_ADDRESS \
  --network eip155:84532
```

What to share with the buyer:
- `http://127.0.0.1:4021/` (promo URL for sharing)
- `http://127.0.0.1:4021/download` (direct buy URL)
- or your LAN IP (if you want another device on the same network to test)

### Public link (Cloudflare quick tunnel)

Prereq: `cloudflared` installed.

Install examples:

```bash
# macOS (Homebrew)
brew install cloudflared

# Windows (winget)
winget install --id Cloudflare.cloudflared
```

Linux packages/docs:
`https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`

```bash
bash scripts/publish.sh --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --public
```

Direct CLI equivalent:

```bash
leak --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --public
```

The CLI will print something like:
- `[leak] public URL: https://xxxx.trycloudflare.com`
- `[leak] promo link: https://xxxx.trycloudflare.com/`
- `[leak] buy link:   https://xxxx.trycloudflare.com/download`

Share `/` in social posts. Use `/download` for agent-assisted purchases.

Optional OpenGraph card metadata flags:

```bash
leak --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --public \
  --og-title "Nightwire" \
  --og-description "Limited release, agent-assisted purchase" \
  --og-image-url https://cdn.example.com/nightwire-cover.jpg \
  --ended-window-seconds 86400
```

### Confirmed settlement (optional)

Use `--confirmed` to settle on-chain before issuing the token:

```bash
leak --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --confirmed
```

This flag must be used when the user wants to sell their content as it ensures that buyers can only download the content if their payments are confirmed onchain.

## Buy content

Activate when user says:
- "buy this"
- "download this"
- "get this file"
- "purchase this"
- Or provides a leak URL directly

Preferred: use the helper script (ensures install first).

Prereq: An EVM-compatible private key

### Buyer flow

When the user wants to buy/download:

1. **URL**: Get the promo URL or download URL (if not already provided)
   - Example promo URL: `https://xxxx.trycloudflare.com/`
   - Example download URL: `https://xxxx.trycloudflare.com/download`

2. **Check prerequisites** (in order):
   - Do they have a wallet/private key?
   - Do they have enough USDC to cover the price?

3. **Missing wallet?** 
   - Tell them the price
   - Help them create an EVM-compatible wallet
   - Save the key pair securely and tell them where

4. **Missing funds?**
   - Tell them exactly how much USDC to send
   - Wait for confirmation, then retry

5. **Execute purchase**:
   - Run the buy script with their private key
   - Show them the receipt (transaction hash, network)
   - Confirm file saved location

6. **Success**:
   - Confirm the file is saved
   - Show them the path


```bash
bash scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key 0xBUYER_KEY
```

Direct CLI equivalent:

```bash
leak buy "https://xxxx.trycloudflare.com/" --buyer-private-key 0xBUYER_KEY
```

Optional save naming:

```bash
# choose exact output path
leak buy "https://xxxx.trycloudflare.com/" --buyer-private-key 0x... --out ./downloads/myfile.bin

# choose basename, keep server extension
leak buy "https://xxxx.trycloudflare.com/" --buyer-private-key 0x... --basename myfile
```

### Common buyer issues

| Issue | Agent response |
|-------|---------------|
| "I don't have a wallet" | Create one using eth-account, save securely |
| "I don't have USDC" | Explain amount needed + where to get it |
| "Transaction failed" | Check gas, retry, or check if sale ended |
| "File already exists" | Ask to overwrite or choose new name |

### Example buyer interaction

User: "buy this https://abc123.trycloudflare.com/"

Agent: 
- "I'll help you download that. First, I'll check what it costs..."
- [Fetches 402 response to get price]
- "This costs 0.01 USDC. Do you have a wallet with USDC, or do you need help setting one up?"


## Troubleshooting

- **`leak: command not found`** → run `bash skills/leak/scripts/ensure_leak.sh` or use `npx -y leak-cli --help` for one-off commands.
- **`Invalid seller payout address`** → use a valid Ethereum address for `--pay-to` / `SELLER_PAY_TO` (`0x` + 40 hex chars).
- **`--public` tunnel fails** → install `cloudflared` (`brew install cloudflared` on macOS), then retry.
- **Port in use** → add `--port 4021` with a different number and use that port in the tunnel.
