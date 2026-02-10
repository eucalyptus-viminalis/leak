#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

function usageAndExit(code = 1) {
  console.log(
    "Usage: leak buy <download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]",
  );
  console.log("Examples:");
  console.log(
    "  leak buy https://xxxx.trycloudflare.com/download --buyer-private-key 0x...",
  );
  console.log(
    "  leak buy https://xxxx.trycloudflare.com/download --buyer-private-key 0x... --basename myfile",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usageAndExit(0);
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function getHeaderCaseInsensitive(headers, name) {
  const target = name.toLowerCase();
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === target) return v;
  }
  return null;
}

function normalizePrivateKey(pk) {
  const s = String(pk).trim();
  if (s.startsWith("0x")) return s;
  return `0x${s}`;
}

function filenameFromContentDisposition(cd) {
  // Very small parser: attachment; filename="foo.ext"
  if (!cd) return null;
  const m = String(cd).match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = m ? (m[1] || m[2]) : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const downloadUrl = args._[0];
  if (!downloadUrl) usageAndExit(1);

  const buyerPk =
    args["buyer-private-key"] || process.env.BUYER_PRIVATE_KEY || process.env.LEAK_BUYER_PRIVATE_KEY;
  if (!buyerPk) {
    console.error(
      "Missing --buyer-private-key (or env BUYER_PRIVATE_KEY / LEAK_BUYER_PRIVATE_KEY)",
    );
    process.exit(1);
  }

  const account = privateKeyToAccount(normalizePrivateKey(buyerPk));
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  // 1) Request: expect 402 with PAYMENT-REQUIRED header.
  const r1 = await fetch(downloadUrl, { method: "GET" });
  if (r1.status !== 402) {
    const text = await r1.text().catch(() => "");
    throw new Error(`Expected 402, got ${r1.status}: ${text}`);
  }

  const paymentRequiredHeader = getHeaderCaseInsensitive(r1.headers, "PAYMENT-REQUIRED");
  if (!paymentRequiredHeader) throw new Error("Missing PAYMENT-REQUIRED header");

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const payload = await client.createPaymentPayload(paymentRequired);
  const paymentHeader = encodePaymentSignatureHeader(payload);

  // 2) Retry with payment signature, expect token JSON.
  const r2 = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      "PAYMENT-SIGNATURE": paymentHeader,
    },
  });

  if (!r2.ok) {
    const text = await r2.text().catch(() => "");
    throw new Error(`Payment failed ${r2.status}: ${text}`);
  }

  const data = await r2.json();
  const token = data?.token;
  if (!token) throw new Error(`Missing token in response: ${JSON.stringify(data)}`);

  // Determine download URL for the token step.
  const base = new URL(downloadUrl);
  const tokenUrl = new URL(base.toString());
  tokenUrl.searchParams.set("token", token);

  // 3) Download with token.
  const r3 = await fetch(tokenUrl.toString(), { method: "GET" });
  if (!r3.ok) {
    const text = await r3.text().catch(() => "");
    throw new Error(`Download failed ${r3.status}: ${text}`);
  }

  const serverFilename =
    data?.filename ||
    filenameFromContentDisposition(r3.headers.get("content-disposition")) ||
    "downloaded.bin";

  let outPath;
  if (args.out) {
    outPath = String(args.out);
  } else if (args.basename) {
    const ext = path.extname(serverFilename) || "";
    outPath = `./${args.basename}${ext}`;
  } else {
    outPath = `./${serverFilename}`;
  }

  const buf = Buffer.from(await r3.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);

  console.log(`Saved ${buf.length} bytes -> ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
