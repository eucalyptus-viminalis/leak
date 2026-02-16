---
name: leak-buy
description: Buy and download x402-gated leak content from promo or download links using a preinstalled leak CLI.
compatibility: Requires access to the internet
version: 2026.2.17-beta.0
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

## Dependency policy (required)

1. Require `leak` binary on PATH.
2. Do not execute `npx` or dynamic package install at runtime.

## Required inputs

1. Leak promo or download URL.
2. Buyer key file path.

## Command

```bash
bash skills/leak-buy/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file <buyer_key_file_path>
```

## Optional output controls

```bash
bash skills/leak-buy/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file <buyer_key_file_path> --out ./downloads/myfile.bin
```

```bash
bash skills/leak-buy/scripts/buy.sh "<promo_or_download_url>" --buyer-private-key-file <buyer_key_file_path> --basename myfile
```

## First response template

1. Confirm URL type (`/` or `/download`).
2. Ask for buyer key file path.
3. Run buy command with `--buyer-private-key-file`.
4. Report saved file path and bytes downloaded.

## Troubleshooting

- `leak` missing:
  - install: `npm i -g leak-cli`
- key mode errors:
  - use only `--buyer-private-key-file <path>`
