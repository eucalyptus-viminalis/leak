import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer, HTTPFacilitatorClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4021);

// Mirror the Python env names (with a couple backwards-compatible aliases)
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const SELLER_PAY_TO = process.env.SELLER_PAY_TO || process.env.PAY_TO;
const PRICE_USD = process.env.PRICE_USD || "1.00";
const CHAIN_ID = process.env.CHAIN_ID || process.env.NETWORK || "eip155:84532"; // Base Sepolia (works with x402.org facilitator by default)
const ARTIFACT_PATH = process.env.ARTIFACT_PATH || process.env.PROTECTED_FILE;
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS || 3600);

const CONFIRMATION_POLICY = process.env.CONFIRMATION_POLICY || "optimistic"; // optimistic|confirmed
const CONFIRMATIONS_REQUIRED = Number(process.env.CONFIRMATIONS_REQUIRED || 1);

const MIME_TYPE = process.env.PROTECTED_MIME || "application/octet-stream";

if (!SELLER_PAY_TO) {
  console.error("Missing required env var: SELLER_PAY_TO (or PAY_TO)");
  process.exit(1);
}
if (!ARTIFACT_PATH) {
  console.error("Missing required env var: ARTIFACT_PATH (or PROTECTED_FILE)");
  process.exit(1);
}

function absArtifactPath() {
  return path.isAbsolute(ARTIFACT_PATH) ? ARTIFACT_PATH : path.join(__dirname, "..", ARTIFACT_PATH);
}

// In-memory grants (v1). Later: SQLite.
/** @type {Map<string, { token: string, expiresAt: number, downloadsLeft: number|null }>} */
const GRANTS = new Map();

function now() {
  return Math.floor(Date.now() / 1000);
}

function mintGrant() {
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
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
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
    description: "gpublic paywalled download",
    mimeType: MIME_TYPE,
  },
};

const httpServer = new x402HTTPResourceServer(coreServer, routes);
await httpServer.initialize();

app.get("/", (req, res) => {
  res.json({
    name: "paywall-node",
    artifact: path.basename(absArtifactPath()),
    price_usd: PRICE_USD,
    network: CHAIN_ID,
    pay_to: SELLER_PAY_TO,
    window_seconds: WINDOW_SECONDS,
    confirmation_policy: CONFIRMATION_POLICY,
    confirmations_required: CONFIRMATIONS_REQUIRED,
    facilitator_url: FACILITATOR_URL,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, ts: now() });
});

// x402 gate for GET /download (supports PAYMENT-SIGNATURE and legacy X-PAYMENT by aliasing)
app.use("/download", async (req, res, next) => {
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
      return req.path;
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
      const v = req.query?.[name];
      return v;
    },
  };

  const result = await httpServer.processHTTPRequest({
    adapter,
    path: req.path,
    method: req.method,
  });

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
  // 1) If caller already has a valid access token, serve the artifact.
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (token) {
    const check = validateAndConsumeToken(token);
    if (!check.ok) return res.status(403).json({ error: check.reason });

    const p = absArtifactPath();
    if (!fs.existsSync(p)) return res.status(404).json({ error: "artifact not found", path: p });

    res.setHeader("Content-Type", MIME_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename=\"${path.basename(p)}\"`);
    return fs.createReadStream(p).pipe(res);
  }

  // 2) No token: if we got here, payment has been verified by the middleware.
  // If you want immediate UX, just mint token. If you want stronger guarantees, settle.
  if (CONFIRMATION_POLICY === "confirmed") {
    const settle = await httpServer.processSettlement(
      req.x402.paymentPayload,
      req.x402.paymentRequirements,
      req.x402.declaredExtensions,
    );

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
  return res.json({
    ok: true,
    token: t,
    expires_in: WINDOW_SECONDS,
    download_url: `/download?token=${t}`,
  });
});

app.listen(PORT, () => {
  console.log(`paywall-node listening on http://localhost:${PORT}`);
  console.log(`info:    http://localhost:${PORT}/`);
  console.log(`health:  http://localhost:${PORT}/health`);
  console.log(`download http://localhost:${PORT}/download (x402 protected)`);
});
