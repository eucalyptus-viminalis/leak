import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer, HTTPFacilitatorClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { isAddress } from "viem";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function isAbsoluteHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toSafeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const PORT = Number(process.env.PORT || 4021);

// Mirror the Python env names (with a couple backwards-compatible aliases)
const FACILITATOR_MODE = (process.env.FACILITATOR_MODE || "testnet").trim();
const CDP_API_KEY_ID = (process.env.CDP_API_KEY_ID || "").trim();
const CDP_API_KEY_SECRET = (process.env.CDP_API_KEY_SECRET || "").trim();
const DEFAULT_TESTNET_FACILITATOR_URL = "https://x402.org/facilitator";
const DEFAULT_CDP_MAINNET_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const FACILITATOR_URL = (
  process.env.FACILITATOR_URL ||
  (FACILITATOR_MODE === "cdp_mainnet" ? DEFAULT_CDP_MAINNET_FACILITATOR_URL : DEFAULT_TESTNET_FACILITATOR_URL)
).trim();
const SELLER_PAY_TO = String(process.env.SELLER_PAY_TO || process.env.PAY_TO || "").trim();
const PRICE_USD = process.env.PRICE_USD || "1.00";
const CHAIN_ID = process.env.CHAIN_ID || process.env.NETWORK || "eip155:84532";
const ARTIFACT_PATH = process.env.ARTIFACT_PATH || process.env.PROTECTED_FILE;
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS || 3600);
const MAX_GRANTS = parsePositiveInt(process.env.MAX_GRANTS, 10000);
const GRANT_SWEEP_SECONDS = parsePositiveInt(process.env.GRANT_SWEEP_SECONDS, 60);

const CONFIRMATION_POLICY = process.env.CONFIRMATION_POLICY || "confirmed"; // optimistic|confirmed
const CONFIRMATIONS_REQUIRED = Number(process.env.CONFIRMATIONS_REQUIRED || 1);

const MIME_TYPE = process.env.PROTECTED_MIME || "application/octet-stream";

const OG_TITLE = (process.env.OG_TITLE || "").trim();
const OG_DESCRIPTION = (process.env.OG_DESCRIPTION || "").trim();
const OG_IMAGE_URL = (process.env.OG_IMAGE_URL || "").trim();
const OG_IMAGE_PATH_RAW = (process.env.OG_IMAGE_PATH || "").trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").trim();
const OG_IMAGE_PATH = OG_IMAGE_PATH_RAW
  ? (path.isAbsolute(OG_IMAGE_PATH_RAW) ? OG_IMAGE_PATH_RAW : path.join(__dirname, "..", OG_IMAGE_PATH_RAW))
  : "";
const SKILL_NAME = "leak";
const SKILL_DESCRIPTION = "Sell or buy x402-gated digital content using the leak CLI tool";
const SKILL_SOURCE = "clawhub";
const SKILL_INSTALL_COMMAND = "clawhub install leak";
const WELL_KNOWN_CACHE_CONTROL = "public, max-age=60";
const LEGACY_DISCOVERY_DEPRECATION =
  "Deprecated endpoint; use /.well-known/skills/index.json for RFC-compatible discovery.";

const SALE_START_TS = parsePositiveInt(process.env.SALE_START_TS, now());
const SALE_END_TS = parsePositiveInt(process.env.SALE_END_TS, SALE_START_TS + WINDOW_SECONDS);
const ENDED_WINDOW_SECONDS = parseNonNegativeInt(process.env.ENDED_WINDOW_SECONDS, 0);
const IS_BASE_MAINNET = CHAIN_ID === "eip155:8453";

if (!new Set(["testnet", "cdp_mainnet"]).has(FACILITATOR_MODE)) {
  console.error("Invalid FACILITATOR_MODE. Supported values: testnet, cdp_mainnet");
  process.exit(1);
}

if (IS_BASE_MAINNET && FACILITATOR_MODE !== "cdp_mainnet") {
  console.error("Invalid config: CHAIN_ID=eip155:8453 requires FACILITATOR_MODE=cdp_mainnet.");
  console.error("Set FACILITATOR_MODE=cdp_mainnet and configure CDP_API_KEY_ID/CDP_API_KEY_SECRET.");
  process.exit(1);
}

if (FACILITATOR_MODE === "cdp_mainnet" && (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET)) {
  console.error("Missing CDP credentials for FACILITATOR_MODE=cdp_mainnet.");
  console.error("Set CDP_API_KEY_ID and CDP_API_KEY_SECRET in your environment.");
  process.exit(1);
}

if (!SELLER_PAY_TO) {
  console.error("Missing required env var: SELLER_PAY_TO (or PAY_TO)");
  process.exit(1);
}
if (!isAddress(SELLER_PAY_TO)) {
  console.error(`Invalid SELLER_PAY_TO (or PAY_TO): ${SELLER_PAY_TO}`);
  console.error("Expected a valid Ethereum address (0x + 40 hex chars).");
  process.exit(1);
}
if (!ARTIFACT_PATH) {
  console.error("Missing required env var: ARTIFACT_PATH (or PROTECTED_FILE)");
  process.exit(1);
}

function absArtifactPath() {
  return path.isAbsolute(ARTIFACT_PATH) ? ARTIFACT_PATH : path.join(__dirname, "..", ARTIFACT_PATH);
}

const ARTIFACT_NAME = path.basename(absArtifactPath());

function saleEnded(ts = now()) {
  return ts >= SALE_END_TS;
}

function endedWindowActive(ts = now()) {
  if (ENDED_WINDOW_SECONDS <= 0) return false;
  return ts >= SALE_END_TS && ts < SALE_END_TS + ENDED_WINDOW_SECONDS;
}

function endedWindowCutoffTs() {
  return SALE_END_TS + ENDED_WINDOW_SECONDS;
}

function saleStatus(ts = now()) {
  return saleEnded(ts) ? "ended" : "live";
}

function baseUrlFromReq(req) {
  if (isAbsoluteHttpUrl(PUBLIC_BASE_URL)) {
    return PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  const host = req.get("host");
  return `${req.protocol}://${host}`;
}

function imageMimeTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".avif") return "image/avif";
  return null;
}

function classifyFacilitatorError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  if (
    msg.includes("401")
    || msg.includes("403")
    || msg.includes("unauthorized")
    || msg.includes("forbidden")
    || msg.includes("authorization")
    || msg.includes("bearer")
    || msg.includes("jwt")
    || msg.includes("api key")
    || msg.includes("invalid key format")
  ) {
    return "auth";
  }
  if (
    msg.includes("does not support scheme")
    || msg.includes("unsupported")
    || (msg.includes("network") && (msg.includes("mismatch") || msg.includes("invalid")))
  ) {
    return "network";
  }
  return "generic";
}

function printFacilitatorHint(err) {
  const kind = classifyFacilitatorError(err);
  if (kind === "auth") {
    console.error("[hint] Facilitator authentication failed.");
    console.error("[hint] For mainnet, set FACILITATOR_MODE=cdp_mainnet and valid CDP_API_KEY_ID/CDP_API_KEY_SECRET.");
    return;
  }
  if (kind === "network") {
    console.error("[hint] Facilitator/network mismatch.");
    console.error("[hint] Verify CHAIN_ID and FACILITATOR_URL/FACILITATOR_MODE are aligned.");
    return;
  }
  if (IS_BASE_MAINNET) {
    console.error("[hint] Base mainnet requires a mainnet-capable facilitator and valid auth.");
  }
}

function joinUrlPath(basePath, suffix) {
  const normalizedBase = basePath.replace(/\/+$/, "");
  return `${normalizedBase}${suffix}`;
}

function createCdpAuthHeadersFactory() {
  const url = new URL(FACILITATOR_URL);
  const requestHost = url.host;
  const verifyPath = joinUrlPath(url.pathname, "/verify");
  const settlePath = joinUrlPath(url.pathname, "/settle");
  const supportedPath = joinUrlPath(url.pathname, "/supported");

  return async () => {
    let generateJwt;
    try {
      ({ generateJwt } = await import("@coinbase/cdp-sdk/auth"));
    } catch {
      throw new Error("CDP auth helper unavailable. Install @coinbase/cdp-sdk and retry.");
    }

    const createAuthorization = async (requestMethod, requestPath) => {
      const jwt = await generateJwt({
        apiKeyId: CDP_API_KEY_ID,
        apiKeySecret: CDP_API_KEY_SECRET,
        requestMethod,
        requestHost,
        requestPath,
        expiresIn: 120,
      });
      return { Authorization: `Bearer ${jwt}` };
    };

    return {
      verify: await createAuthorization("POST", verifyPath),
      settle: await createAuthorization("POST", settlePath),
      supported: await createAuthorization("GET", supportedPath),
    };
  };
}

async function preflightCdpAuth() {
  if (FACILITATOR_MODE !== "cdp_mainnet") return;

  let generateJwt;
  try {
    ({ generateJwt } = await import("@coinbase/cdp-sdk/auth"));
  } catch {
    console.error("[startup] Missing CDP auth dependency. Install @coinbase/cdp-sdk.");
    process.exit(1);
  }

  const url = new URL(FACILITATOR_URL);
  const requestHost = url.host;
  const supportedPath = joinUrlPath(url.pathname, "/supported");
  try {
    await generateJwt({
      apiKeyId: CDP_API_KEY_ID,
      apiKeySecret: CDP_API_KEY_SECRET,
      requestMethod: "GET",
      requestHost,
      requestPath: supportedPath,
      expiresIn: 120,
    });
  } catch (err) {
    console.error("[startup] CDP auth preflight failed.");
    console.error(`[startup] ${err?.message || String(err)}`);
    process.exit(1);
  }
}

function promoModel(req) {
  const baseUrl = baseUrlFromReq(req);
  const promoUrl = `${baseUrl}/`;
  const downloadUrl = `${baseUrl}/download`;
  const imageUrl = isAbsoluteHttpUrl(OG_IMAGE_URL)
    ? OG_IMAGE_URL
    : (OG_IMAGE_PATH ? `${baseUrl}/og-image` : `${baseUrl}/og.svg`);
  const ogTitle = OG_TITLE || ARTIFACT_NAME;
  const ogDescription =
    OG_DESCRIPTION ||
    `Pay ${PRICE_USD} on ${CHAIN_ID} to unlock ${ARTIFACT_NAME}. Access is time-limited and agent-assisted via /download.`;

  return {
    baseUrl,
    promoUrl,
    downloadUrl,
    imageUrl,
    ogTitle,
    ogDescription,
    saleStartTs: SALE_START_TS,
    saleEndTs: SALE_END_TS,
    endedWindowSeconds: ENDED_WINDOW_SECONDS,
    endedWindowCutoffTs: endedWindowCutoffTs(),
  };
}

function discoveryIndexUrl(model) {
  return `${model.baseUrl}/.well-known/skills/index.json`;
}

function rfcResourceUrl(model) {
  return `${model.baseUrl}/.well-known/skills/${SKILL_NAME}/resource.json`;
}

function buildDiscoveryResource(req) {
  const model = promoModel(req);
  return {
    name: SKILL_NAME,
    status: saleStatus(),
    promo_url: model.promoUrl,
    download_url: model.downloadUrl,
    artifact_name: ARTIFACT_NAME,
    price_usd: PRICE_USD,
    price_currency: "USDC",
    network: CHAIN_ID,
    sale_end: new Date(SALE_END_TS * 1000).toISOString(),
  };
}

function renderWellKnownSkillMd(req) {
  const resource = buildDiscoveryResource(req);
  return `# ${SKILL_NAME}

${SKILL_DESCRIPTION}

## Discovery
- Promo URL: ${resource.promo_url}
- Download URL: ${resource.download_url}
- Status: ${resource.status}
- Sale ends: ${resource.sale_end}

## Agent Flow
1. Read resource metadata from \`/.well-known/skills/${SKILL_NAME}/resource.json\`.
2. Use \`download_url\` for x402 purchase and token mint.
3. Download the file from \`/download?token=...\` and save it locally.

## CLI
- Install: \`${SKILL_INSTALL_COMMAND}\`
- Buy: \`leak buy <promo_or_download_url> --buyer-private-key-file ./buyer.key\`
`;
}

function sendSkillIndex(req, res) {
  const payload = {
    skills: [
      {
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        files: ["SKILL.md", "resource.json"],
      },
    ],
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", WELL_KNOWN_CACHE_CONTROL);
  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).json(payload);
}

function sendSkillMarkdown(req, res) {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", WELL_KNOWN_CACHE_CONTROL);
  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).send(renderWellKnownSkillMd(req));
}

function sendSkillResource(req, res) {
  const payload = buildDiscoveryResource(req);
  const statusCode = payload.status === "ended" ? 410 : 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", WELL_KNOWN_CACHE_CONTROL);
  if (req.method === "HEAD") return res.status(statusCode).end();
  return res.status(statusCode).json(payload);
}

function renderPromoPage(model, { ended }) {
  const stateLabel = ended ? "Ended" : "Live";
  const pageTitle = model.ogTitle;
  const description = ended
    ? `This leak has ended. ${model.ogDescription}`
    : model.ogDescription;
  const expiresIso = new Date(model.saleEndTs * 1000).toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: model.ogTitle,
    description,
    image: model.imageUrl,
    url: model.promoUrl,
    category: "DigitalDocument",
    offers: {
      "@type": "Offer",
      url: model.downloadUrl,
      price: PRICE_USD,
      priceCurrency: "USD",
      availability: ended ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      validThrough: expiresIso,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "paymentProtocol", value: "x402" },
      { "@type": "PropertyValue", name: "paymentSettlementCurrency", value: "USDC" },
      { "@type": "PropertyValue", name: "network", value: CHAIN_ID },
      { "@type": "PropertyValue", name: "downloadUrl", value: model.downloadUrl },
    ],
  };
  const safeJsonLd = toSafeJsonForScript(jsonLd);

  const examplePrompt = `Buy this and save it: ${model.downloadUrl}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(model.promoUrl)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(model.imageUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(model.imageUrl)}" />

  <script type="application/ld+json">${safeJsonLd}</script>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; padding: 24px; background: #f7f7f5; color: #1f1f1f; }
    .card { max-width: 760px; margin: 0 auto; border: 1px solid #d8d8d0; background: #fff; border-radius: 10px; padding: 20px; }
    .state { display: inline-block; font-size: 12px; border: 1px solid #bbb; border-radius: 999px; padding: 2px 10px; margin-bottom: 12px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { line-height: 1.5; }
    .kv { margin: 14px 0; font-size: 14px; color: #333; }
    code, pre { background: #f0f0eb; border-radius: 6px; padding: 2px 6px; }
    pre { padding: 10px; overflow-x: auto; }
    .prompt-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .prompt-head p { margin: 0; }
    button.copy-btn { border: 1px solid #bdbdae; background: #f5f5ef; color: #1f1f1f; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 13px; }
    button.copy-btn:hover { background: #ecece4; }
    .copy-status { font-size: 12px; color: #3f3f3f; min-height: 1em; }
    .install-note { margin-top: 16px; font-size: 13px; color: #2f2f2f; }
    .install-note a { color: #1f1f1f; }
  </style>
</head>
<body>
  <main class="card">
    <div class="state">${escapeHtml(stateLabel)}</div>
    <h1>${escapeHtml(pageTitle)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><strong>Agent-assisted purchase:</strong> this release is designed to be bought through an agent using the x402 endpoint below.</p>

    <div class="kv"><strong>Price:</strong> ${escapeHtml(PRICE_USD)} USD equivalent</div>
    <div class="kv"><strong>Network:</strong> ${escapeHtml(CHAIN_ID)}</div>
    <div class="kv"><strong>Sale end:</strong> ${escapeHtml(expiresIso)}</div>

    <p><strong>x402 URL</strong><br /><code>${escapeHtml(model.downloadUrl)}</code></p>
    <div class="prompt-head">
      <p><strong>Example agent prompt</strong></p>
      <button class="copy-btn" id="copy-agent-prompt" type="button" aria-label="Copy example agent prompt">Copy prompt</button>
      <span class="copy-status" id="copy-prompt-status" aria-live="polite"></span>
    </div>
    <pre id="example-agent-prompt">${escapeHtml(examplePrompt)}</pre>
    <p class="install-note">
      Need help setting this up? Install leak at
      <a href="https://github.com/eucalyptus-viminalis/leak">github.com/eucalyptus-viminalis/leak</a>
      or search for leak on clawhub.
    </p>
  </main>
  <script>
    (() => {
      const button = document.getElementById("copy-agent-prompt");
      const pre = document.getElementById("example-agent-prompt");
      const status = document.getElementById("copy-prompt-status");
      if (!button || !pre) return;

      const setStatus = (text) => {
        if (status) status.textContent = text;
      };

      button.addEventListener("click", async () => {
        const text = pre.textContent || "";
        if (!text) return;
        const original = "Copy prompt";
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "absolute";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          }
          button.textContent = "Copied";
          setStatus("Copied to clipboard.");
          setTimeout(() => {
            button.textContent = original;
            setStatus("");
          }, 1500);
        } catch {
          setStatus("Copy failed. Select and copy manually.");
        }
      });
    })();
  </script>
</body>
</html>`;
}

function renderOgSvg(req) {
  const model = promoModel(req);
  const title = model.ogTitle;
  const subtitle = `Pay ${PRICE_USD} on ${CHAIN_ID}`;
  const status = saleEnded() ? "ENDED" : "LIVE";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4f4ef"/>
      <stop offset="100%" stop-color="#dfdfd4"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="64" y="64" width="1072" height="502" rx="18" fill="#ffffff" stroke="#bdbdae"/>
  <text x="96" y="170" font-size="32" font-family="monospace" fill="#222">${escapeXml(status)} LEAK</text>
  <text x="96" y="250" font-size="52" font-family="monospace" fill="#111">${escapeXml(title)}</text>
  <text x="96" y="330" font-size="30" font-family="monospace" fill="#333">${escapeXml(subtitle)}</text>
  <text x="96" y="404" font-size="22" font-family="monospace" fill="#444">x402 via /download</text>
</svg>`;
}

// In-memory grants (v1). Later: SQLite.
/** @type {Map<string, { token: string, expiresAt: number, downloadsLeft: number|null }>} */
const GRANTS = new Map();

function pruneExpiredGrants() {
  const ts = now();
  for (const [token, grant] of GRANTS.entries()) {
    if (grant.expiresAt < ts) GRANTS.delete(token);
  }
}

function enforceGrantLimit() {
  while (GRANTS.size >= MAX_GRANTS) {
    const oldest = GRANTS.keys().next().value;
    if (!oldest) return;
    GRANTS.delete(oldest);
  }
}

function mintGrant() {
  pruneExpiredGrants();
  enforceGrantLimit();

  const token = randomUUID().replaceAll("-", "");
  GRANTS.set(token, {
    token,
    expiresAt: now() + WINDOW_SECONDS,
    downloadsLeft: null, // null = unlimited
  });
  return token;
}

function validateAndConsumeToken(token) {
  const g = GRANTS.get(token);
  if (!g) return { ok: false, reason: "invalid token" };
  if (g.expiresAt < now()) {
    GRANTS.delete(token);
    return { ok: false, reason: "token expired" };
  }
  if (g.downloadsLeft !== null) {
    if (g.downloadsLeft <= 0) return { ok: false, reason: "download limit reached" };
    g.downloadsLeft -= 1;
  }
  return { ok: true };
}

const app = express();

// x402 core server + HTTP wrapper
await preflightCdpAuth();
const facilitatorConfig = { url: FACILITATOR_URL };
if (FACILITATOR_MODE === "cdp_mainnet") {
  facilitatorConfig.createAuthHeaders = createCdpAuthHeadersFactory();
}
const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
const coreServer = new x402ResourceServer(facilitatorClient).register(CHAIN_ID, new ExactEvmScheme());

// Route config for x402HTTPResourceServer
const routes = {
  "GET /download": {
    accepts: [
      {
        scheme: "exact",
        price: `$${PRICE_USD}`,
        network: CHAIN_ID,
        payTo: SELLER_PAY_TO,
        maxTimeoutSeconds: WINDOW_SECONDS,
      },
    ],
    description: ARTIFACT_NAME,
    mimeType: MIME_TYPE,
  },
};

const httpServer = new x402HTTPResourceServer(coreServer, routes);
try {
  await httpServer.initialize();
} catch (err) {
  console.error("[startup] Failed to initialize x402 route configuration.");
  console.error(`[startup] facilitator=${FACILITATOR_URL} mode=${FACILITATOR_MODE} network=${CHAIN_ID}`);
  if (Array.isArray(err?.errors) && err.errors.length > 0) {
    for (const e of err.errors) {
      console.error(`[startup] ${e.message || JSON.stringify(e)}`);
    }
  } else {
    console.error(`[startup] ${err?.message || String(err)}`);
  }
  printFacilitatorHint(err);
  process.exit(1);
}

setInterval(() => {
  pruneExpiredGrants();
}, GRANT_SWEEP_SECONDS * 1000).unref();

app.get("/", (req, res) => {
  const model = promoModel(req);
  const ended = saleEnded();
  const status = ended ? 410 : 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(status).send(renderPromoPage(model, { ended }));
});

app.get("/info", (req, res) => {
  const model = promoModel(req);
  res.json({
    name: "leak",
    artifact: path.basename(absArtifactPath()),
    price_usd: PRICE_USD,
    network: CHAIN_ID,
    pay_to: SELLER_PAY_TO,
    window_seconds: WINDOW_SECONDS,
    confirmation_policy: CONFIRMATION_POLICY,
    confirmations_required: CONFIRMATIONS_REQUIRED,
    facilitator_url: FACILITATOR_URL,
    facilitator_mode: FACILITATOR_MODE,
    download_url: model.downloadUrl,
    promo_url: model.promoUrl,
  });
});

app.get("/og.svg", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).send(renderOgSvg(req));
});

app.get("/og-image", (req, res) => {
  if (!OG_IMAGE_PATH) {
    return res.status(404).json({ error: "og image not configured" });
  }
  if (!fs.existsSync(OG_IMAGE_PATH)) {
    return res.status(404).json({ error: "og image not found" });
  }

  let stat;
  try {
    stat = fs.statSync(OG_IMAGE_PATH);
  } catch {
    return res.status(404).json({ error: "og image unavailable" });
  }
  if (!stat.isFile()) {
    return res.status(404).json({ error: "og image unavailable" });
  }

  const contentType = imageMimeTypeFromPath(OG_IMAGE_PATH);
  if (!contentType) {
    return res.status(404).json({ error: "og image unavailable" });
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=60");
  const stream = fs.createReadStream(OG_IMAGE_PATH);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: "og image unavailable" });
    } else {
      res.end();
    }
  });
  return stream.pipe(res);
});

app.get("/health", (req, res) => {
  res.json({ ok: true, ts: now() });
});

app.get("/.well-known/skills/index.json", sendSkillIndex);
app.head("/.well-known/skills/index.json", sendSkillIndex);

app.get(`/.well-known/skills/${SKILL_NAME}/SKILL.md`, sendSkillMarkdown);
app.head(`/.well-known/skills/${SKILL_NAME}/SKILL.md`, sendSkillMarkdown);

app.get(`/.well-known/skills/${SKILL_NAME}/resource.json`, sendSkillResource);
app.head(`/.well-known/skills/${SKILL_NAME}/resource.json`, sendSkillResource);

// Well-known endpoint for agent skill discovery (RFC-inspired)
app.get("/.well-known/leak", (req, res) => {
  const model = promoModel(req);
  const rfcResourcePath = rfcResourceUrl(model);
  const discoveryPath = discoveryIndexUrl(model);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", WELL_KNOWN_CACHE_CONTROL);
  if (saleEnded()) {
    return res.status(410).json({
      error: "sale ended",
      skill: {
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        source: SKILL_SOURCE,
        install_command: SKILL_INSTALL_COMMAND,
      },
      message: "This leak has expired, but you can install the leak skill for future purchases",
      deprecation: LEGACY_DISCOVERY_DEPRECATION,
      discovery_index_url: discoveryPath,
      rfc_resource_url: rfcResourcePath,
    });
  }

  res.json({
    skill: {
      name: SKILL_NAME,
      description: SKILL_DESCRIPTION,
      source: SKILL_SOURCE,
      install_command: SKILL_INSTALL_COMMAND,
    },
    resource: {
      type: "x402-gated-download",
      download_url: model.downloadUrl,
      promo_url: model.promoUrl,
      artifact_name: ARTIFACT_NAME,
      price_usd: PRICE_USD,
      price_currency: "USDC",
      network: CHAIN_ID,
      sale_end: new Date(SALE_END_TS * 1000).toISOString(),
    },
    deprecation: LEGACY_DISCOVERY_DEPRECATION,
    discovery_index_url: discoveryPath,
    rfc_resource_url: rfcResourcePath,
  });
});

// x402 gate for GET /download (supports PAYMENT-SIGNATURE and legacy X-PAYMENT by aliasing)
app.use("/download", async (req, res, next) => {
  if (saleEnded()) {
    return res.status(410).json({ error: "leak ended" });
  }

  // If a valid token is supplied, skip x402 and let the handler serve the file.
  // (Matches the Python implementation: token check happens before payment requirement.)
  if (typeof req.query.token === "string" && req.query.token.length > 0) {
    return next();
  }

  // NOTE: because this middleware is mounted at "/download", Express strips the mount
  // path and `req.path` becomes "/". x402 route matching needs the *full* path.
  const fullPath = `${req.baseUrl || ""}${req.path || ""}`;

  const adapter = {
    getHeader(name) {
      const v = req.get(name);
      if (v) return v;
      // legacy support: treat X-PAYMENT as PAYMENT-SIGNATURE (same base64 JSON format)
      const lower = String(name).toLowerCase();
      if (lower === "payment-signature") return req.get("x-payment") || undefined;
      if (lower === "payment-required") return req.get("payment-required") || undefined;
      return undefined;
    },
    getMethod() {
      return req.method;
    },
    getPath() {
      return fullPath;
    },
    getUrl() {
      return `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    },
    getAcceptHeader() {
      return req.get("accept") || "";
    },
    getUserAgent() {
      return req.get("user-agent") || "";
    },
    getQueryParam(name) {
      return req.query?.[name];
    },
  };

  let result;
  try {
    result = await httpServer.processHTTPRequest({
      adapter,
      path: fullPath,
      method: req.method,
    });
  } catch (err) {
    console.error(`[x402] payment handshake failed: ${err?.message || String(err)}`);
    printFacilitatorHint(err);
    return res.status(502).json({ error: "payment gateway unavailable" });
  }

  if (result.type === "no-payment-required") return next();

  if (result.type === "payment-error") {
    for (const [k, v] of Object.entries(result.response.headers || {})) res.setHeader(k, v);
    return res.status(result.response.status).send(result.response.body ?? "");
  }

  // payment verified
  req.x402 = {
    paymentPayload: result.paymentPayload,
    paymentRequirements: result.paymentRequirements,
    declaredExtensions: result.declaredExtensions,
  };

  return next();
});

app.get("/download", async (req, res) => {
  if (saleEnded()) {
    return res.status(410).json({ error: "leak ended" });
  }

  // 1) If caller already has a valid access token, serve the artifact.
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (token) {
    const check = validateAndConsumeToken(token);
    if (!check.ok) return res.status(403).json({ error: check.reason });

    const p = absArtifactPath();
    if (!fs.existsSync(p)) return res.status(404).json({ error: "artifact not found" });

    res.setHeader("Content-Type", MIME_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename=\"${path.basename(p)}\"`);
    return fs.createReadStream(p).pipe(res);
  }

  // 2) No token: if we got here, payment has been verified by the middleware.
  // If you want immediate UX, just mint token. If you want stronger guarantees, settle.
  if (CONFIRMATION_POLICY === "confirmed") {
    let settle;
    try {
      settle = await httpServer.processSettlement(
        req.x402.paymentPayload,
        req.x402.paymentRequirements,
        req.x402.declaredExtensions,
      );
    } catch (err) {
      console.error(`[x402] settlement request failed: ${err?.message || String(err)}`);
      printFacilitatorHint(err);
      return res.status(502).json({ error: "payment settlement unavailable" });
    }

    if (!settle.success) {
      return res.status(402).json({
        error: "payment settlement failed",
        reason: settle.errorReason,
        message: settle.errorMessage,
      });
    }

    for (const [k, v] of Object.entries(settle.headers || {})) res.setHeader(k, v);
    res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
  }

  const t = mintGrant();
  const p = absArtifactPath();

  return res.json({
    ok: true,
    token: t,
    expires_in: WINDOW_SECONDS,
    download_url: `/download?token=${t}`,
    filename: path.basename(p),
    mime_type: MIME_TYPE,
  });
});

app.listen(PORT, () => {
  console.log(`x402-node listening on http://localhost:${PORT}`);
  console.log(`facilitator mode: ${FACILITATOR_MODE}`);
  console.log(`facilitator url:  ${FACILITATOR_URL}`);
  console.log(`network:          ${CHAIN_ID}`);
  console.log(`promo:   http://localhost:${PORT}/ (share this)`);
  console.log(`info:    http://localhost:${PORT}/info`);
  console.log(`health:  http://localhost:${PORT}/health`);
  console.log(`download http://localhost:${PORT}/download (x402 protected)`);
  if (endedWindowActive()) {
    console.log(
      `ended-window active until ${new Date(endedWindowCutoffTs() * 1000).toISOString()} (HTTP 410 mode)`,
    );
  }
});
