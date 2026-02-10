import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4021);

const PAY_TO = process.env.PAY_TO;
const PRICE = process.env.PRICE || "$0.001";
const NETWORK = process.env.NETWORK || "eip155:84532"; // Base Sepolia
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://www.x402.org/facilitator";

const PROTECTED_FILE = process.env.PROTECTED_FILE || "./protected/asset.bin";
const PROTECTED_MIME = process.env.PROTECTED_MIME || "application/octet-stream";

if (!PAY_TO) {
  console.error("Missing PAY_TO in env (receiver address)");
  process.exit(1);
}

const app = express();

// Facilitator client + resource server + scheme registration
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient).register(NETWORK, new ExactEvmScheme());

// Paywall the download route
app.use(
  paymentMiddleware(
    {
      "GET /download": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE,
            network: NETWORK,
            payTo: PAY_TO,
          },
        ],
        description: "Paywalled download",
        mimeType: PROTECTED_MIME,
      },
    },
    server,
  ),
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/download", (req, res) => {
  const absPath = path.isAbsolute(PROTECTED_FILE)
    ? PROTECTED_FILE
    : path.join(__dirname, "..", PROTECTED_FILE);

  if (!fs.existsSync(absPath)) {
    return res.status(404).json({
      error: "PROTECTED_FILE not found",
      path: absPath,
    });
  }

  res.setHeader("Content-Type", PROTECTED_MIME);
  res.setHeader("Content-Disposition", `attachment; filename=\"${path.basename(absPath)}\"`);

  const stream = fs.createReadStream(absPath);
  stream.on("error", (err) => {
    console.error("stream error", err);
    res.status(500).end();
  });
  stream.pipe(res);
});

app.listen(PORT, () => {
  console.log(`paywall-node listening on http://localhost:${PORT}`);
  console.log(`health:   http://localhost:${PORT}/health`);
  console.log(`download: http://localhost:${PORT}/download (x402 protected)`);
});
