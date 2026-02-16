---
name: leak
description: Sell or buy x402-gated digital content using the leak CLI tool. On the seller side, use this skill when the user wants to publish, release, or "leak" a file and wants to charge a price. On the buyer side, use this when the user wants to download a file that requires payment.
compatibility: Requires access to the internet
version: 2026.2.16
metadata:
  openclaw:
    emoji: 💦
    os: ["darwin", "linux"]
    requires:
      env:
      bins: ["node", "leak"]
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
- **Publish** a local file behind an x402 `402 Payment Required` gate.
- **Share** the promo URL (`/`) for social cards and agent discovery.
- **Buy** from promo URL (`/`) or download URL (`/download`) and save locally.

## Safety Policy (required)

Follow these rules every time:
1. Never request, store, or pass raw private keys in command arguments.
2. Do not create wallets by default. Wallet creation is allowed only as an explicit user opt-in fallback in the buyer flow.
3. Require explicit user confirmation of the file path before publishing.
4. Require explicit user consent before internet exposure (`--public`).
5. Never print private key material in normal output.

## Command Resolution

Prefer `leak` on PATH:

```bash
leak --help
```

If `leak` is not installed, use pinned one-off execution:

```bash
npx -y leak-cli@2026.2.14 --help
```

Do not run auto-install or git-clone fallback scripts from this skill.

## Publish Content (seller)

Activate when user asks to publish/release/sell/leak a file.

### Required inputs
1. File path (must be a regular file).
2. Price in USDC.
3. Sale window duration.
4. Seller payout address (`--pay-to`).
5. Whether to expose publicly (`--public`).

### Guardrails enforced by CLI
1. Reject directories and symlinks.
2. Block sensitive paths by default (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gcloud`, `/etc`, `/proc`, `/sys`, `/var/run/secrets`).
3. If `--public` is used, require explicit confirmation phrase.

### Local publish

```bash
bash skills/leak/scripts/publish.sh \
  --file ./protected/asset.bin \
  --price 0.01 \
  --window 15m \
  --pay-to 0xSELLER_ADDRESS \
  --network eip155:84532
```

### Public publish

```bash
bash skills/leak/scripts/publish.sh \
  --file ./protected/asset.bin \
  --price 0.01 \
  --window 15m \
  --pay-to 0xSELLER_ADDRESS \
  --public
```

The tool prints:
- `PROMO LINK: https://.../`
- `BUY LINK: https://.../download`

Share the promo link (`/`) in social posts.

## Buy Content (buyer)

Activate when user asks to buy/download a leak URL.

### Buyer Fast Path Protocol (required)

Use this default conversation sequence for unknown leak links:
1. Install `leak` if missing.
2. Ask for an existing buyer key file path.
3. If the user does not have one, offer this fallback:

`I can generate a fresh buyer key at ./.leak/buyer.key and continue. This is a hot wallet, so keep funds minimal and back up the key safely.`

4. Only if the user explicitly agrees, run the Opt-in Key Creation Subflow below.
5. Run:

```bash
bash skills/leak/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file <buyer_key_file_path>
```

6. Report saved file path and bytes downloaded.

Funding rule for x402 buys:
- Use only the payment token/asset and amount quoted by the server `402 Payment Required` response (for example, `0.01 USDC`).
- Do not require assets other than the one specified in the 402 response for gas in standard x402-gated download guidance.
- Mention gas only if `leak buy` returns an explicit gas-related error.

Default key mode is `--buyer-private-key-file`. Only use `--buyer-private-key-stdin` if the user asks for stdin flow.

Do not:
1. Ask for raw private key text in chat.
2. Start with manual x402 transfer/signing explanations.
3. Present multiple speculative option trees before attempting the buy script.
4. Tell the user they need ETH for gas for the standard x402 buy flow if that asset isn't specified in the 402 response.

If the user explicitly asks protocol details, then explain x402 internals.

### Opt-in Key Creation Subflow (deterministic)

Use this subflow only after explicit user consent to create a key:
1. Confirm destination path: `./.leak/buyer.key`.
2. Create directory and key file with owner-only permissions:
  - directory: `0700`
  - key file: `0600`
3. Write private key as a single hex line in the key file (no `0x` prefix).
4. Do not print key material in normal output. It is acceptable to show only the derived wallet address.
5. If current workspace is a git repository, tell the user you will add the key path to `.gitignore` to prevent tracking, then apply idempotently:

```bash
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  touch .gitignore
  grep -qxF "./.leak/buyer.key" .gitignore || echo "./.leak/buyer.key" >> .gitignore
fi
```

6. Continue buyer flow using:

```bash
bash skills/leak/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file ./.leak/buyer.key
```

### Buyer first-response template

Use this shape for first reply after receiving a leak URL:
1. Confirm link type (promo `/` or `/download`).
2. Request install approval: `clawhub install leak`.
3. Ask for existing buyer key file path.
4. Include concise alternative: `I can create one safely in ./.leak/buyer.key if you want.`
5. If funding guidance is needed, reference the quoted `402` payment token amount (not ETH gas).

### Key handling requirements

Use exactly one of:
1. `--buyer-private-key-file <path>`
2. `--buyer-private-key-stdin`

Do not use `--buyer-private-key`; it is blocked.

### Buy examples

```bash
bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key
```

```bash
cat ./buyer.key | bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-stdin
```

Optional output controls:

```bash
bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key --out ./downloads/myfile.bin
```

```bash
bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key --basename myfile
```

## Troubleshooting

- `leak: command not found`:
  - Install globally: `npm i -g leak-cli`
  - Or run pinned: `npx -y leak-cli@2026.2.14 --help`
- `Invalid seller payout address`:
  - Use a valid Ethereum address (`0x` + 40 hex chars).
- `--public` confirmation failed:
  - Re-run and provide the exact confirmation phrase when prompted.
