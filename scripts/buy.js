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
import { DOWNLOAD_CODE_HEADER } from "../src/download_code.js";
import { createUi } from "./ui.js";

const SKILL_NAME = "leak-buy";
const outUi = createUi(process.stdout);
const errUi = createUi(process.stderr);

function usageAndExit(code = 1) {
  console.log(outUi.heading("Leak Buy CLI"));
  console.log("");
  console.log(outUi.section("Usage"));
  console.log("  leak buy <promo_or_download_url> [--download-code <code> | --download-code-stdin] [--buyer-private-key-file <path> | --buyer-private-key-stdin] [--out <path> | --basename <name>]");
  console.log("");
  console.log(outUi.section("Examples"));
  console.log("  leak buy https://xxxx.trycloudflare.com/ --buyer-private-key-file ./buyer.key");
  console.log("  leak buy https://xxxx.trycloudflare.com/download --download-code friends-only --buyer-private-key-file ./buyer.key --basename myfile");
  console.log("  printf '%s\\n' 'friends-only' | leak buy https://xxxx.trycloudflare.com/download --download-code-stdin --out ./downloads/file.bin");
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

function readFirstLineFromStdin(kindLabel) {
  let data = "";
  try {
    data = fs.readFileSync(0, "utf8");
  } catch {
    throw new Error(`Failed to read ${kindLabel} from stdin`);
  }
  const firstLine = String(data).split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine) {
    throw new Error(`No ${kindLabel} received on stdin`);
  }
  return firstLine;
}

function readPrivateKeyFromStdin() {
  return readFirstLineFromStdin("buyer private key");
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

function resolveDownloadCode(args) {
  const hasInlineCode = typeof args["download-code"] !== "undefined";
  const hasStdinCode = Boolean(args["download-code-stdin"]);

  if (hasInlineCode && hasStdinCode) {
    throw new Error("Use exactly one download code input: --download-code or --download-code-stdin");
  }
  if (hasInlineCode && args["download-code"] === true) {
    throw new Error("--download-code requires a value");
  }
  if (hasStdinCode && Boolean(args["buyer-private-key-stdin"])) {
    throw new Error("--download-code-stdin cannot be combined with --buyer-private-key-stdin");
  }
  if (hasInlineCode) {
    const code = String(args["download-code"] || "").trim();
    if (!code) throw new Error("--download-code cannot be empty");
    return code;
  }
  if (hasStdinCode) {
    return readFirstLineFromStdin("download code");
  }
  return "";
}

function filenameFromContentDisposition(cd) {
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
  const isRootPath = inputUrl.pathname === "/" || inputUrl.pathname === "";
  const isDownloadPath = inputUrl.pathname === "/download";

  if (isDownloadPath) {
    return { downloadUrl: inputUrl.toString() };
  }

  if (!isRootPath) {
    throw new Error(
      `Unsupported path for buy flow: ${inputUrl.pathname}. Use a promo URL (/) or /download URL.`,
    );
  }

  const rfcResourceUrl = new URL(`/.well-known/skills/${SKILL_NAME}/resource.json`, inputUrl.origin).toString();
  const rfcFetch = await fetchJsonPayload(rfcResourceUrl);
  if (rfcFetch.ok && (rfcFetch.response.status === 200 || rfcFetch.response.status === 410)) {
    const resourceStatus = String(rfcFetch.body?.status || "").toLowerCase();
    if (rfcFetch.response.status === 410 || resourceStatus === "ended") {
      throw new Error(`Sale has ended according to ${rfcResourceUrl}`);
    }
    if (typeof rfcFetch.body?.download_url === "string" && rfcFetch.body.download_url) {
      return {
        downloadUrl: normalizeSameOriginDownloadUrl(
          rfcFetch.body.download_url,
          inputUrl.origin,
          rfcResourceUrl,
        ),
        discovery: rfcFetch.body,
      };
    }
  }

  const legacyDiscoveryUrl = new URL("/.well-known/leak", inputUrl.origin).toString();
  const legacyFetch = await fetchJsonPayload(legacyDiscoveryUrl);
  if (legacyFetch.ok && (legacyFetch.response.status === 200 || legacyFetch.response.status === 410)) {
    if (legacyFetch.response.status === 410) {
      throw new Error(`Sale has ended according to ${legacyDiscoveryUrl}`);
    }
    if (typeof legacyFetch.body?.resource?.download_url === "string" && legacyFetch.body.resource.download_url) {
      return {
        downloadUrl: normalizeSameOriginDownloadUrl(
          legacyFetch.body.resource.download_url,
          inputUrl.origin,
          legacyDiscoveryUrl,
        ),
        discovery: legacyFetch.body.resource,
      };
    }
  }

  return { downloadUrl: new URL("/download", inputUrl.origin).toString() };
}

function responseBodyText(response) {
  return response.text().catch(() => "");
}

function resolveOutputPath(args, serverFilename) {
  const safeServerFilename = sanitizeFilename(serverFilename || "downloaded.bin");
  if (args.out) {
    return String(args.out);
  }
  if (args.basename) {
    const safeBase = sanitizeFilename(args.basename);
    const ext = path.extname(safeServerFilename) || "";
    return `./${safeBase}${ext}`;
  }
  return `./${safeServerFilename}`;
}

async function saveBinaryResponse(response, args, suggestedFilename) {
  const serverFilename =
    suggestedFilename ||
    filenameFromContentDisposition(response.headers.get("content-disposition")) ||
    "downloaded.bin";

  const outPath = resolveOutputPath(args, serverFilename);
  const buf = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(outUi.statusLine("ok", `Saved ${buf.length} bytes -> ${outPath}`));
}

async function finalizeDownloadResponse(response, { args, downloadUrl }) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    await saveBinaryResponse(response, args, null);
    return;
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected non-download JSON response");
  }

  if (typeof data.token === "string" && data.token) {
    const tokenUrl = new URL(downloadUrl);
    tokenUrl.searchParams.set("token", data.token);

    const r3 = await fetch(tokenUrl.toString(), { method: "GET" });
    if (!r3.ok) {
      const text = await responseBodyText(r3);
      throw new Error(`Download failed ${r3.status}: ${text}`);
    }

    await saveBinaryResponse(r3, args, data.filename || null);
    return;
  }

  if (typeof data.download_url === "string" && data.download_url) {
    const sameOriginDownload = normalizeSameOriginDownloadUrl(
      data.download_url,
      new URL(downloadUrl).origin,
      downloadUrl,
    );
    const r3 = await fetch(sameOriginDownload, { method: "GET" });
    if (!r3.ok) {
      const text = await responseBodyText(r3);
      throw new Error(`Download failed ${r3.status}: ${text}`);
    }
    await saveBinaryResponse(r3, args, data.filename || null);
    return;
  }

  throw new Error(`Unexpected JSON response from download endpoint: ${JSON.stringify(data)}`);
}

function maybePrintPaymentReceipt(response) {
  const paymentResponseHeader =
    getHeaderCaseInsensitive(response.headers, "PAYMENT-RESPONSE") ||
    getHeaderCaseInsensitive(response.headers, "X-PAYMENT-RESPONSE");
  if (!paymentResponseHeader) return;

  try {
    const receipt = decodePaymentResponseHeader(paymentResponseHeader);
    const explorer = explorerTxUrl(receipt.network, receipt.transaction);
    console.log("");
    console.log(outUi.section("Payment Receipt"));
    const rows = [
      { key: "network", value: receipt.network },
      receipt.payer ? { key: "payer", value: receipt.payer } : null,
      { key: "tx", value: receipt.transaction },
      explorer ? { key: "explorer", value: explorer } : null,
    ];
    for (const line of outUi.formatRows(rows)) {
      console.log(line);
    }
  } catch (err) {
    console.error(
      errUi.statusLine(
        "warn",
        `Could not decode PAYMENT-RESPONSE header (${err.message || String(err)})`,
      ),
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputUrl = args._[0];
  if (!inputUrl) usageAndExit(1);

  const downloadCode = resolveDownloadCode(args);

  const resolved = await resolveDownloadUrl(inputUrl);
  const downloadUrl = resolved.downloadUrl;
  if (downloadUrl !== inputUrl) {
    console.log(outUi.statusLine("info", `Resolved purchase endpoint: ${downloadUrl}`));
  }

  const initialHeaders = {};
  if (downloadCode) initialHeaders[DOWNLOAD_CODE_HEADER] = downloadCode;

  const r1 = await fetch(downloadUrl, {
    method: "GET",
    headers: initialHeaders,
  });

  if (r1.status === 410) {
    throw new Error(`Sale has ended at ${downloadUrl}`);
  }

  if (r1.status === 401) {
    const text = await responseBodyText(r1);
    throw new Error(
      `Download code required or invalid (send header ${DOWNLOAD_CODE_HEADER}). ${text}`,
    );
  }

  if (r1.status === 402) {
    const paymentRequiredHeader = getHeaderCaseInsensitive(r1.headers, "PAYMENT-REQUIRED");
    if (!paymentRequiredHeader) throw new Error("Missing PAYMENT-REQUIRED header");

    let buyerPk;
    try {
      buyerPk = resolveBuyerPrivateKey(args);
    } catch (err) {
      throw new Error(`${err.message || String(err)} (payment required by seller)`);
    }

    let account;
    try {
      account = privateKeyToAccount(normalizePrivateKey(buyerPk));
    } catch {
      throw new Error("Invalid buyer private key format.");
    }

    const client = new x402Client();
    registerExactEvmScheme(client, { signer: account });

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
    const payload = await client.createPaymentPayload(paymentRequired);
    const paymentHeader = encodePaymentSignatureHeader(payload);

    const r2 = await fetch(downloadUrl, {
      method: "GET",
      headers: {
        ...initialHeaders,
        "PAYMENT-SIGNATURE": paymentHeader,
      },
    });

    if (!r2.ok) {
      const text = await responseBodyText(r2);
      throw new Error(`Payment failed ${r2.status}: ${text}`);
    }

    maybePrintPaymentReceipt(r2);
    await finalizeDownloadResponse(r2, { args, downloadUrl });
    return;
  }

  if (!r1.ok) {
    const text = await responseBodyText(r1);
    throw new Error(`Download failed ${r1.status}: ${text}`);
  }

  await finalizeDownloadResponse(r1, { args, downloadUrl });
}

main().catch((e) => {
  const detail = e?.stack || e?.message || String(e);
  console.error(errUi.statusLine("error", detail));
  process.exit(1);
});
