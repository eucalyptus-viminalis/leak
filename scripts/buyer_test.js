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

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4021";
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const OUTPUT_PATH = process.env.OUTPUT_PATH || "downloaded.bin";

if (!BUYER_PRIVATE_KEY) {
  console.error("Missing BUYER_PRIVATE_KEY env var");
  process.exit(1);
}

const account = privateKeyToAccount(
  BUYER_PRIVATE_KEY.startsWith("0x") ? BUYER_PRIVATE_KEY : `0x${BUYER_PRIVATE_KEY}`,
);

const client = new x402Client();
registerExactEvmScheme(client, { signer: account });

function getHeaderCaseInsensitive(headers, name) {
  const target = name.toLowerCase();
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === target) return v;
  }
  return null;
}

async function main() {
  // 1) First request: expect 402 with PAYMENT-REQUIRED header.
  const r1 = await fetch(`${BASE_URL}/download`, { method: "GET" });
  if (r1.status !== 402) {
    const text = await r1.text().catch(() => "");
    throw new Error(`Expected 402, got ${r1.status}: ${text}`);
  }

  const paymentRequiredHeader = getHeaderCaseInsensitive(r1.headers, "PAYMENT-REQUIRED");
  if (!paymentRequiredHeader) throw new Error("Missing PAYMENT-REQUIRED header");

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const payload = await client.createPaymentPayload(paymentRequired);
  const paymentHeader = encodePaymentSignatureHeader(payload);

  // 2) Second request: send payment signature, expect token JSON.
  const r2 = await fetch(`${BASE_URL}/download`, {
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

  // 3) Final request: download artifact with token.
  const r3 = await fetch(`${BASE_URL}/download?token=${encodeURIComponent(token)}`, {
    method: "GET",
  });

  if (!r3.ok) {
    const text = await r3.text().catch(() => "");
    throw new Error(`Download failed ${r3.status}: ${text}`);
  }

  const buf = Buffer.from(await r3.arrayBuffer());
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, buf);
  console.log(`Downloaded ${buf.length} bytes to ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
