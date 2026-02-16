---
name: leak-buy
description: Buy and download x402-gated leak content from promo or download links using a preinstalled leak CLI.
compatibility: Requires access to the internet
version: 2026.2.17-beta.1
metadata:
  openclaw:
    emoji: 🛒
    os: ["darwin", "linux"]
    requires:
      env:
      bins: ["leak"]
    install:
      - kind: node
        package: leak-cli
        bins: ["leak"]
        label: "Install leak-cli via npm"
  author: eucalyptus-viminalis
---

# leak-buy

## Overview

This skill operates `leak buy` workflows only:
- Accept a promo URL (`/`) or download URL (`/download`).
- Pay via x402 flow.
- Save downloaded file locally.

## Safety policy (required)

1. Never ask for raw private key text in chat.
2. Never create buyer keys from this skill.
3. Allow only `--buyer-private-key-file <path>`.
4. Block raw-key argument mode and stdin key mode.
5. Never print private key material.
6. Never construct shell commands by concatenating raw user input.
7. Pass URL/path as quoted argv tokens, never through `eval` or `sh -c`.
8. Reject URL/key path values with whitespace/control characters.
9. Require buyer key path to resolve to an existing readable regular file (non-symlink).

## Dependency policy (required)

1. Require `leak` binary on PATH.
2. Do not execute `npx` or dynamic package install at runtime.

## Required inputs

1. Leak promo or download URL.
2. Buyer key file path.

## Safe command construction (required)

Use this pattern:

```bash
PROMO_URL="https://xxxx.trycloudflare.com/"
BUYER_KEY_FILE="./buyer.key"
bash skills/leak-buy/scripts/buy.sh "$PROMO_URL" --buyer-private-key-file "$BUYER_KEY_FILE"
```

Do not use placeholder interpolation like `<...>` directly in executable shell strings.

## Command

```bash
bash skills/leak-buy/scripts/buy.sh "$PROMO_URL" --buyer-private-key-file "$BUYER_KEY_FILE"
```

## Optional output controls

```bash
bash skills/leak-buy/scripts/buy.sh "$PROMO_URL" --buyer-private-key-file "$BUYER_KEY_FILE" --out ./downloads/myfile.bin
```

```bash
bash skills/leak-buy/scripts/buy.sh "$PROMO_URL" --buyer-private-key-file "$BUYER_KEY_FILE" --basename myfile
```

## First response template

1. Confirm URL type (`/` or `/download`).
2. Ask for buyer key file path.
3. Validate URL/key path safety constraints and run with quoted argv tokens.
4. Report saved file path and bytes downloaded.

## Troubleshooting

- `leak` missing:
  - install: `npm i -g leak-cli`
- key mode errors:
  - use only `--buyer-private-key-file <path>`
