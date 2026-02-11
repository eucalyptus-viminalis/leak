---
name: leak
description: Create and consume x402 paywalled download links using the leak CLI/server. Use when the user asks to “leak this file”, “paywall this download”, “start a paid download link”, “make an x402 402-protected download”, or to “buy/download a leak link”.
---

# leak (x402 paywalled downloads)

This skill operates the `leak` project:
- **Publish** a file behind an x402 `402 Payment Required` gate and mint a time-limited token after payment.
- **Buy** a paywalled `/download` URL and save the artifact locally.

## Install / ensure CLI exists (first step)

Prefer the `leak` CLI on PATH. If missing, install it from the GitHub repo via `npm link`.

Run:

```bash
bash skills/leak/scripts/ensure_leak.sh
```

Notes:
- Installs into `~/leak` (clones if missing).
- Runs `npm install` and `npm link` so `leak ...` works globally.

## Publish a paywalled download (server)

### Local-only (recommended default)

```bash
leak leak \
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

```bash
leak leak --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --public
```

The CLI will print something like:
- `[leak] public URL: https://xxxx.trycloudflare.com`
- `[leak] share link: https://xxxx.trycloudflare.com/download`

Share the `/download` link.

### Confirmed settlement (optional)

Use `--confirmed` to settle on-chain before issuing the token:

```bash
leak leak --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... --confirmed
```

## Buy a paywalled download link

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

- **`leak: command not found`** → run `bash skills/leak/scripts/ensure_leak.sh`.
- **`--public` tunnel fails** → install `cloudflared` and retry.
- **Port in use** → add `--port 4021` with a different number and use that port in the tunnel.
