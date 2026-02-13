#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SKILL_NAME = "leak";

function usageAndExit(code = 1) {
  console.log(
    "Usage: leak buy <promo_or_download_url> (--buyer-private-key-file <path> | --buyer-private-key-stdin) [--out <path> | --basename <name>]",
  );
  console.log("Examples:");
  console.log(
    "  leak buy https://xxxx.trycloudflare.com/ --buyer-private-key-file ./buyer.key",
  );
  console.log(
    "  cat ./buyer.key | leak buy https://xxxx.trycloudflare.com/download --buyer-private-key-stdin --basename myfile",
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

function readPrivateKeyFromFile(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("Missing value for --buyer-private-key-file");
  }
  const absPath = path.resolve(process.cwd(), filePath.trim());
  if (!fs.existsSync(absPath)) {
    throw new Error(`Private key file not found: ${absPath}`);
  }
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    throw new Error(`Private key path must be a file: ${absPath}`);
  }
  const contents = fs.readFileSync(absPath, "utf8");
  const firstLine = String(contents).split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine) {
    throw new Error(`Private key file is empty: ${absPath}`);
  }
  return firstLine;
}

function readPrivateKeyFromStdin() {
  let data = "";
  try {
    data = fs.readFileSync(0, "utf8");
  } catch {
    throw new Error("Failed to read private key from stdin");
  }
  const firstLine = String(data).split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine) {
    throw new Error("No private key received on stdin");
  }
  return firstLine;
}

function resolveBuyerPrivateKey(args) {
  if (typeof args["buyer-private-key"] !== "undefined") {
    throw new Error(
      "The --buyer-private-key flag is insecure and no longer supported. Use --buyer-private-key-file <path> or --buyer-private-key-stdin.",
    );
  }

  const hasFileFlag = typeof args["buyer-private-key-file"] !== "undefined";
  const hasStdinFlag = Boolean(args["buyer-private-key-stdin"]);
  if (hasFileFlag && hasStdinFlag) {
    throw new Error("Use exactly one key input: --buyer-private-key-file or --buyer-private-key-stdin");
  }
  if (hasFileFlag) {
    return readPrivateKeyFromFile(args["buyer-private-key-file"]);
  }
  if (hasStdinFlag) {
    return readPrivateKeyFromStdin();
  }

  throw new Error(
    "Missing buyer key input. Use --buyer-private-key-file <path> or --buyer-private-key-stdin.",
  );
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

function sanitizeFilename(name) {
  const base = path.basename(String(name || "").trim());
  if (!base || base === "." || base === "..") return "downloaded.bin";
  return base.replace(/[\u0000-\u001f\u007f]/g, "_");
}

function explorerTxUrl(network, transaction) {
  if (!network || !transaction) return null;
  if (network === "eip155:8453") return `https://basescan.org/tx/${transaction}`;
  if (network === "eip155:84532") return `https://sepolia.basescan.org/tx/${transaction}`;
  return null;
}

function formatTriedEndpoints(tried) {
  if (!Array.isArray(tried) || tried.length === 0) return "";
  return `\nTried:\n- ${tried.join("\n- ")}`;
}

function normalizeInputUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol for buy flow: ${parsed.protocol}`);
  }
  return parsed;
}

function normalizeSameOriginDownloadUrl(candidate, origin, sourceLabel) {
  let parsed;
  try {
    parsed = new URL(String(candidate), origin);
  } catch {
    throw new Error(`Invalid download_url from ${sourceLabel}`);
  }
  if (parsed.origin !== origin) {
    throw new Error(
      `Rejected cross-origin download_url from ${sourceLabel}: expected ${origin}, got ${parsed.origin}`,
    );
  }
  return parsed.toString();
}

async function probeX402Endpoint(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (response.status === 402) {
      const paymentRequiredHeader = getHeaderCaseInsensitive(response.headers, "PAYMENT-REQUIRED");
      if (paymentRequiredHeader) return { kind: "x402", response, paymentRequiredHeader };
      return { kind: "not-x402", response };
    }
    if (response.status === 410) {
      return { kind: "ended", response };
    }
    return { kind: "other", response };
  } catch (err) {
    return { kind: "error", error: err };
  }
}

async function fetchJsonPayload(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { ok: true, response, body };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function resolveDownloadUrl(input) {
  const inputUrl = normalizeInputUrl(input);
  const tried = [];
  const isRootPath = inputUrl.pathname === "/" || inputUrl.pathname === "";
  const isDownloadPath = inputUrl.pathname === "/download";

  tried.push(`direct probe ${inputUrl.toString()}`);
  const directProbe = await probeX402Endpoint(inputUrl.toString());
  if (directProbe.kind === "x402") {
    return {
      downloadUrl: inputUrl.toString(),
      firstProbe: directProbe,
      tried,
    };
  }
  if (directProbe.kind === "ended") {
    throw new Error(`Sale has ended at ${inputUrl.toString()}${formatTriedEndpoints(tried)}`);
  }
  if (!isRootPath && !isDownloadPath) {
    throw new Error(
      `Unsupported path for buy flow: ${inputUrl.pathname}. Use a promo URL (/) or /download URL.${formatTriedEndpoints(tried)}`,
    );
  }

  const rfcResourceUrl = new URL(`/.well-known/skills/${SKILL_NAME}/resource.json`, inputUrl.origin).toString();
  tried.push(`rfc resource ${rfcResourceUrl}`);
  const rfcFetch = await fetchJsonPayload(rfcResourceUrl);
  if (rfcFetch.ok && (rfcFetch.response.status === 200 || rfcFetch.response.status === 410)) {
    const resourceStatus = String(rfcFetch.body?.status || "").toLowerCase();
    if (rfcFetch.response.status === 410 || resourceStatus === "ended") {
      throw new Error(`Sale has ended according to ${rfcResourceUrl}${formatTriedEndpoints(tried)}`);
    }
    if (typeof rfcFetch.body?.download_url === "string" && rfcFetch.body.download_url) {
      const rfcDownloadUrl = normalizeSameOriginDownloadUrl(
        rfcFetch.body.download_url,
        inputUrl.origin,
        rfcResourceUrl,
      );
      tried.push(`probe discovered RFC download ${rfcDownloadUrl}`);
      const rfcProbe = await probeX402Endpoint(rfcDownloadUrl);
      if (rfcProbe.kind === "x402") {
        return {
          downloadUrl: rfcDownloadUrl,
          firstProbe: rfcProbe,
          tried,
        };
      }
      if (rfcProbe.kind === "ended") {
        throw new Error(`Sale has ended at ${rfcDownloadUrl}${formatTriedEndpoints(tried)}`);
      }
    }
  }

  const legacyDiscoveryUrl = new URL("/.well-known/leak", inputUrl.origin).toString();
  tried.push(`legacy discovery ${legacyDiscoveryUrl}`);
  const legacyFetch = await fetchJsonPayload(legacyDiscoveryUrl);
  if (legacyFetch.ok && (legacyFetch.response.status === 200 || legacyFetch.response.status === 410)) {
    if (legacyFetch.response.status === 410) {
      throw new Error(`Sale has ended according to ${legacyDiscoveryUrl}${formatTriedEndpoints(tried)}`);
    }
    if (typeof legacyFetch.body?.resource?.download_url === "string" && legacyFetch.body.resource.download_url) {
      const legacyDownloadUrl = normalizeSameOriginDownloadUrl(
        legacyFetch.body.resource.download_url,
        inputUrl.origin,
        legacyDiscoveryUrl,
      );
      tried.push(`probe discovered legacy download ${legacyDownloadUrl}`);
      const legacyProbe = await probeX402Endpoint(legacyDownloadUrl);
      if (legacyProbe.kind === "x402") {
        return {
          downloadUrl: legacyDownloadUrl,
          firstProbe: legacyProbe,
          tried,
        };
      }
      if (legacyProbe.kind === "ended") {
        throw new Error(`Sale has ended at ${legacyDownloadUrl}${formatTriedEndpoints(tried)}`);
      }
    }
  }

  if (isRootPath) {
    const fallbackDownloadUrl = new URL("/download", inputUrl.origin).toString();
    tried.push(`root fallback ${fallbackDownloadUrl}`);
    const fallbackProbe = await probeX402Endpoint(fallbackDownloadUrl);
    if (fallbackProbe.kind === "x402") {
      return {
        downloadUrl: fallbackDownloadUrl,
        firstProbe: fallbackProbe,
        tried,
      };
    }
    if (fallbackProbe.kind === "ended") {
      throw new Error(`Sale has ended at ${fallbackDownloadUrl}${formatTriedEndpoints(tried)}`);
    }
  }

  throw new Error(
    `Could not resolve an x402 download endpoint from ${inputUrl.toString()}${formatTriedEndpoints(tried)}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputUrl = args._[0];
  if (!inputUrl) usageAndExit(1);

  let buyerPk;
  try {
    buyerPk = resolveBuyerPrivateKey(args);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePrivateKey(buyerPk));
  } catch {
    console.error("Invalid buyer private key format.");
    process.exit(1);
  }
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  const resolved = await resolveDownloadUrl(inputUrl);
  const downloadUrl = resolved.downloadUrl;
  if (downloadUrl !== inputUrl) {
    console.log(`[buy] resolved purchase endpoint: ${downloadUrl}`);
  }

  // 1) Request: expect 402 with PAYMENT-REQUIRED header.
  const r1 = resolved.firstProbe?.response || await fetch(downloadUrl, { method: "GET" });
  if (r1.status !== 402) {
    const text = await r1.text().catch(() => "");
    throw new Error(`Expected 402, got ${r1.status}: ${text}`);
  }

  const paymentRequiredHeader =
    resolved.firstProbe?.paymentRequiredHeader || getHeaderCaseInsensitive(r1.headers, "PAYMENT-REQUIRED");
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

  const paymentResponseHeader =
    getHeaderCaseInsensitive(r2.headers, "PAYMENT-RESPONSE")
    || getHeaderCaseInsensitive(r2.headers, "X-PAYMENT-RESPONSE");
  if (paymentResponseHeader) {
    try {
      const receipt = decodePaymentResponseHeader(paymentResponseHeader);
      const explorer = explorerTxUrl(receipt.network, receipt.transaction);
      console.log("Payment receipt:");
      console.log(`- network: ${receipt.network}`);
      if (receipt.payer) console.log(`- payer:   ${receipt.payer}`);
      console.log(`- tx:      ${receipt.transaction}`);
      if (explorer) console.log(`- explorer: ${explorer}`);
    } catch (err) {
      console.error(`[buy] warning: could not decode PAYMENT-RESPONSE header (${err.message || String(err)})`);
    }
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
  const safeServerFilename = sanitizeFilename(serverFilename);

  let outPath;
  if (args.out) {
    outPath = String(args.out);
  } else if (args.basename) {
    const safeBase = sanitizeFilename(args.basename);
    const ext = path.extname(safeServerFilename) || "";
    outPath = `./${safeBase}${ext}`;
  } else {
    outPath = `./${safeServerFilename}`;
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
