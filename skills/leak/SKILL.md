---
name: leak
description: Create and consume x402 download links using the leak CLI/server. Use when the user asks to “leak this file”, “release/publish a file with x402”, “start a paid download link”, "setup a store for this", “make an x402-protected download link”, "buy/download/save a leak", or to “buy/download/save a leaked link”.
---

# leak (x402 downloads)

This skill operates the `leak` project:
- **Publish** a file behind an x402 `402 Payment Required` gate and mint a time-limited token after payment.
- **Share** `/` as the promo URL (social-card friendly) and use `/download` for the purchase flow.
- **Buy** an x402 `/download` URL and save the artifact locally.

## Install / ensure CLI exists (first step)

Prefer the `leak` CLI on PATH. If missing, install it globally from npm first:

```bash
npm i -g leak-cli
```

If that fails or you need a dev checkout, use the `ensure_leak.sh` fallback:

Run:

```bash
bash skills/leak/scripts/ensure_leak.sh
```

Notes:
- Tries `npm i -g leak-cli` first.
- Fallback installs into `~/leak` (clones if missing over HTTPS), then runs `npm install` and `npm link`.
- Clone source can be overridden with `LEAK_REPO_URL=...`.
- Helper scripts run `leak` when available, otherwise they fall back to `npx -y leak-cli`.

## Publish an x402 download (server)

Preferred: use the helper script, which ensures install and prints a clear share link.

### Local-only (recommended default)

```bash
bash skills/leak/scripts/publish.sh \
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
- `http://127.0.0.1:4021/download` (local testing)
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
bash skills/leak/scripts/publish.sh --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --public
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

Optional card metadata flags:

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

## Buy an x402 download link

Preferred: use the helper script (ensures install first).

```bash
bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key 0xBUYER_KEY
```

Direct CLI equivalent:

```bash
leak buy "https://xxxx.trycloudflare.com/download" --buyer-private-key 0xBUYER_KEY
```

Optional save naming:

```bash
# choose exact output path
leak buy "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x... --out ./downloads/myfile.bin

# choose basename, keep server extension
leak buy "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x... --basename myfile
```

## Troubleshooting

- **`leak: command not found`** → run `bash skills/leak/scripts/ensure_leak.sh` or use `npx -y leak-cli --help` for one-off commands.
- **`--public` tunnel fails** → install `cloudflared` (`brew install cloudflared` on macOS), then retry.
- **Port in use** → add `--port 4021` with a different number and use that port in the tunnel.
