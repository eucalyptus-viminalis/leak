#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { isAddress } from "viem";
import { defaultFacilitatorUrlForMode, readConfig } from "./config_store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ENTRY = path.resolve(__dirname, "..", "src", "index.js");

function usageAndExit(code = 1, hint = "") {
  if (hint) console.error(`Hint: ${hint}\n`);
  console.log(`Usage: leak --file <path> [--price <usdc>] [--window <duration>] [--pay-to <address>] [--network <caip2>] [--port <port>] [--confirmed] [--public] [--og-title <text>] [--og-description <text>] [--og-image-url <https://...|./image.png>] [--ended-window-seconds <seconds>]`);
  console.log(`       leak leak --file <path> [--price <usdc>] [--window <duration>] [--pay-to <address>] [--network <caip2>] [--port <port>] [--confirmed] [--public] [--og-title <text>] [--og-description <text>] [--og-image-url <https://...|./image.png>] [--ended-window-seconds <seconds>]`);
  console.log(``);
  console.log(`Notes:`);
  console.log(`  --public requires cloudflared (Cloudflare Tunnel) installed.`);
  console.log(`Examples:`);
  console.log(`  leak --file ./vape.jpg`);
  console.log(`  leak --file ./vape.jpg --price 0.01 --window 1h --confirmed`);
  console.log(`  leak --file ./vape.jpg --public --og-title "My New Drop" --og-description "Agent-assisted purchase"`);
  console.log(`  leak --file ./vape.jpg --public --og-image-url ./cover.png`);
  console.log(`  npm run leak -- --file ./vape.jpg`);
  console.log(`  npm run leak -- --file ./vape.jpg --price 0.01 --window 1h --confirmed`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usageAndExit(0);
    if (a === "--confirmed") {
      args.confirmed = true;
      continue;
    }
    if (a === "--public") {
      args.public = true;
      continue;
    }
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith("--")) {
      args[key] = val;
      i++;
    } else {
      args[key] = true;
    }
    continue;
  }
  for (const a of argv) {
    if (!a.startsWith("--")) args._.push(a);
  }
  return args;
}

function parseNonNegativeInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function isAbsoluteHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const SUPPORTED_OG_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);

function resolveOgImageInput(value) {
  if (!value) return { ogImageUrl: "", ogImagePath: "" };
  const raw = String(value).trim();
  if (!raw) return { ogImageUrl: "", ogImagePath: "" };

  if (isAbsoluteHttpUrl(raw)) {
    return { ogImageUrl: raw, ogImagePath: "" };
  }

  const localPath = resolveFile(raw);
  if (!fs.existsSync(localPath)) {
    throw new Error("Invalid --og-image-url (must be an absolute http(s) URL or a valid local image file path)");
  }

  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch {
    throw new Error("Invalid --og-image-url (must be an absolute http(s) URL or a valid local image file path)");
  }

  if (!stat.isFile()) {
    throw new Error("Invalid --og-image-url (must be an absolute http(s) URL or a valid local image file path)");
  }

  const ext = path.extname(localPath).toLowerCase();
  if (!SUPPORTED_OG_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error("Invalid --og-image-url (must be an absolute http(s) URL or a valid local image file path)");
  }

  return { ogImageUrl: "", ogImagePath: localPath };
}

function cloudflaredPreflight() {
  const probe = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  if (!probe.error && probe.status === 0) return { ok: true };

  const missing = probe.error?.code === "ENOENT";
  return {
    ok: false,
    missing,
    reason: missing
      ? "cloudflared is not installed or not on PATH."
      : `cloudflared check failed (status=${probe.status ?? "n/a"}).`,
  };
}

function printCloudflaredInstallHelp(localOnlyCmd) {
  console.error("[leak] --public requested, but cloudflared is unavailable.");
  console.error("[leak] cloudflared is required to create a public tunnel URL.");
  console.error("");
  console.error("[leak] Install cloudflared:");
  console.error("  macOS (Homebrew): brew install cloudflared");
  console.error("  Windows (winget): winget install --id Cloudflare.cloudflared");
  console.error("  Linux packages/docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  console.error("");
  console.error("[leak] Retry public mode after install:");
  console.error("  leak --file <path> --pay-to <address> --public");
  console.error("");
  console.error("[leak] Local-only alternative (no tunnel):");
  console.error(`  ${localOnlyCmd}`);
}

function parseDurationToSeconds(s) {
  if (!s) return null;
  const str = String(s).trim().toLowerCase();

  // Allow: "1 hour", "60 minutes", etc.
  const spaced = str.replace(/\s+/g, "");

  // Raw seconds: "3600"
  if (/^\d+$/.test(spaced)) return Number(spaced);

  const m = spaced.match(
    /^(\d+(?:\.\d+)?)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/,
  );
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2];
  if (["s", "sec", "secs", "second", "seconds"].includes(unit)) return Math.round(n);
  if (["m", "min", "mins", "minute", "minutes"].includes(unit)) return Math.round(n * 60);
  if (["h", "hr", "hrs", "hour", "hours"].includes(unit)) return Math.round(n * 3600);
  if (["d", "day", "days"].includes(unit)) return Math.round(n * 86400);
  return null;
}

function resolveFile(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return abs;
}

async function promptMissing({ price, windowSeconds }) {
  const rl = readline.createInterface({ input, output });
  try {
    let p = price;
    if (!p) {
      p = (await rl.question("How much (USDC)? e.g. 0.01 or $0.01: ")).trim();
    }
    p = String(p).trim();
    if (p.startsWith("$")) p = p.slice(1).trim();
    if (!p || Number.isNaN(Number(p))) throw new Error("Invalid price");

    let w = windowSeconds;
    if (!w) {
      w = (await rl.question("How long? (e.g. 15m / 1h / 3600): ")).trim();
    }
    const secs = parseDurationToSeconds(w);
    if (!secs || secs <= 0) throw new Error("Invalid duration");

    return { price: String(p), windowSeconds: secs };
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storedConfig = readConfig();
  if (storedConfig.error) {
    console.error(`[leak] warning: ${storedConfig.error}`);
  }
  const configDefaults = storedConfig.config.defaults || {};

  const fileArg = args.file;
  if (!fileArg) {
    const positionalPath = args._?.[0];
    if (positionalPath) {
      usageAndExit(
        1,
        `Expected '--file <path>', but got positional '${positionalPath}'. If using npm scripts, run: npm run leak -- --file ${positionalPath}`,
      );
    }
    usageAndExit(1);
  }

  const artifactPath = resolveFile(fileArg);
  if (!fs.existsSync(artifactPath)) {
    console.error(`File not found: ${artifactPath}`);
    process.exit(1);
  }

  const payTo = String(args["pay-to"] || process.env.SELLER_PAY_TO || configDefaults.sellerPayTo || "").trim();
  if (!payTo) {
    console.error("Missing --pay-to, SELLER_PAY_TO in env, or sellerPayTo in ~/.leak/config.json");
    process.exit(1);
  }
  if (!isAddress(payTo)) {
    console.error(`Invalid seller payout address: ${payTo}`);
    console.error("Expected a valid Ethereum address (0x + 40 hex chars).");
    process.exit(1);
  }

  const network = args.network || process.env.CHAIN_ID || configDefaults.chainId || "eip155:84532";
  const port = Number(args.port || process.env.PORT || configDefaults.port || 4021);
  const facilitatorMode = (
    process.env.FACILITATOR_MODE || configDefaults.facilitatorMode || "testnet"
  ).trim();
  const facilitatorUrl = (
    process.env.FACILITATOR_URL
    || configDefaults.facilitatorUrl
    || defaultFacilitatorUrlForMode(facilitatorMode)
  ).trim();
  const cdpApiKeyId = process.env.CDP_API_KEY_ID || configDefaults.cdpApiKeyId || "";
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET || configDefaults.cdpApiKeySecret || "";

  const confirmationPolicy = args.confirmed
    ? "confirmed"
    : (process.env.CONFIRMATION_POLICY || configDefaults.confirmationPolicy || "confirmed");
  const ogTitle = typeof args["og-title"] === "string"
    ? args["og-title"]
    : (process.env.OG_TITLE || configDefaults.ogTitle);
  const ogDescription = typeof args["og-description"] === "string"
    ? args["og-description"]
    : (process.env.OG_DESCRIPTION || configDefaults.ogDescription);
  const ogImageInput = typeof args["og-image-url"] === "string"
    ? args["og-image-url"]
    : process.env.OG_IMAGE_URL;
  const endedWindowArg = args["ended-window-seconds"] ?? process.env.ENDED_WINDOW_SECONDS ?? configDefaults.endedWindowSeconds;
  const defaultEndedWindowSeconds = args.public ? 86400 : 0;
  const endedWindowSeconds = parseNonNegativeInt(endedWindowArg);

  const price = args.price || process.env.PRICE_USD || configDefaults.priceUsd; // we keep env name for compatibility
  const windowRaw = args.window || process.env.WINDOW_SECONDS || configDefaults.window;
  const windowSeconds = typeof windowRaw === "string" ? parseDurationToSeconds(windowRaw) : Number(windowRaw);

  const prompted = await promptMissing({ price, windowSeconds: windowSeconds || null });

  if (endedWindowArg !== undefined && endedWindowSeconds === null) {
    console.error("Invalid --ended-window-seconds (must be a non-negative integer)");
    process.exit(1);
  }

  let ogImageResolved;
  try {
    ogImageResolved = resolveOgImageInput(ogImageInput);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }

  const saleStartTs = Math.floor(Date.now() / 1000);
  const saleEndTs = saleStartTs + prompted.windowSeconds;
  const effectiveEndedWindowSeconds = endedWindowSeconds ?? defaultEndedWindowSeconds;
  const stopAfterSeconds = prompted.windowSeconds + effectiveEndedWindowSeconds;

  // Spawn the server with explicit env so there's no confusion.
  const env = {
    ...process.env,
    PORT: String(port),
    SELLER_PAY_TO: payTo,
    PRICE_USD: String(prompted.price),
    CHAIN_ID: String(network),
    FACILITATOR_MODE: facilitatorMode,
    FACILITATOR_URL: facilitatorUrl,
    CDP_API_KEY_ID: cdpApiKeyId,
    CDP_API_KEY_SECRET: cdpApiKeySecret,
    WINDOW_SECONDS: String(prompted.windowSeconds),
    CONFIRMATION_POLICY: confirmationPolicy,
    ARTIFACT_PATH: artifactPath,
    OG_TITLE: ogTitle || "",
    OG_DESCRIPTION: ogDescription || "",
    OG_IMAGE_URL: ogImageResolved.ogImageUrl || "",
    OG_IMAGE_PATH: ogImageResolved.ogImagePath || "",
    SALE_START_TS: String(saleStartTs),
    SALE_END_TS: String(saleEndTs),
    ENDED_WINDOW_SECONDS: String(effectiveEndedWindowSeconds),
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || "",
  };

  console.log("\nLeak config:");
  console.log(`- file:   ${artifactPath}`);
  console.log(`- price:  ${prompted.price} USDC`);
  console.log(`- window: ${prompted.windowSeconds}s`);
  console.log(`- to:     ${payTo}`);
  console.log(`- net:    ${network}`);
  console.log(`- mode:   ${confirmationPolicy}`);
  console.log(`- facilitator_mode: ${facilitatorMode}`);
  console.log(`- facilitator_url:  ${facilitatorUrl}`);
  if (ogTitle) console.log(`- og_title: ${ogTitle}`);
  if (ogDescription) console.log(`- og_description: ${ogDescription}`);
  if (ogImageResolved.ogImageUrl) console.log(`- og_image_url: ${ogImageResolved.ogImageUrl}`);
  if (ogImageResolved.ogImagePath) console.log(`- og_image_path: ${ogImageResolved.ogImagePath}`);
  console.log(`- ended_window: ${effectiveEndedWindowSeconds}s`);

  if (args.public) {
    const preflight = cloudflaredPreflight();
    if (!preflight.ok) {
      const localOnlyCmd = `leak --file ${JSON.stringify(artifactPath)} --price ${prompted.price} --window ${prompted.windowSeconds}s --pay-to ${payTo} --network ${network}${confirmationPolicy === "confirmed" ? " --confirmed" : ""}${Number.isFinite(port) && port !== 4021 ? ` --port ${port}` : ""}${effectiveEndedWindowSeconds > 0 ? ` --ended-window-seconds ${effectiveEndedWindowSeconds}` : ""}`;
      printCloudflaredInstallHelp(localOnlyCmd);
      if (!preflight.missing) {
        console.error(`[leak] detail: ${preflight.reason}`);
      }
      process.exit(1);
    }
  }

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env,
    stdio: "inherit",
  });

  let stoppedByWindow = false;
  let tunnelFatal = false;

  child.on("error", (err) => {
    console.error(`[leak] failed to start server process: ${err.message}`);
    process.exit(1);
  });

  let tunnelProc = null;
  if (args.public) {
    // Cloudflare "quick tunnel" (temporary URL)
    // Requires `cloudflared` installed.
    console.log("\n[leak] starting Cloudflare quick tunnel...");

    tunnelProc = spawn(
      "cloudflared",
      ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    tunnelProc.on("error", (err) => {
      tunnelFatal = true;
      if (err.code === "ENOENT") {
        console.error("[leak] cloudflared not found. Install it or re-run without --public.");
      } else {
        console.error(`[leak] failed to start tunnel: ${err.message}`);
      }
      try {
        child.kill("SIGTERM");
      } catch {}
    });

    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;
    const onData = (chunk) => {
      const s = chunk.toString("utf8");
      const m = s.match(urlRegex);
      if (m && m[0]) {
        const promoUrl = `${m[0]}/`;
        const buyUrl = `${m[0]}/download`;
        console.log(`\n[leak] public URL: ${m[0]}`);
        console.log(`[leak] promo link: ${promoUrl}`);
        console.log(`[leak] buy link:   ${buyUrl}`);
        // only print once
        tunnelProc?.stdout?.off("data", onData);
        tunnelProc?.stderr?.off("data", onData);
      }
    };

    tunnelProc.stdout.on("data", onData);
    tunnelProc.stderr.on("data", onData);

    tunnelProc.on("exit", (code, signal) => {
      if (signal) console.log(`[leak] tunnel exited (signal ${signal})`);
      else console.log(`[leak] tunnel exited (code ${code})`);
    });
  }

  const stopAll = () => {
    stoppedByWindow = true;
    if (effectiveEndedWindowSeconds > 0) {
      console.log(
        `\n[leak] ended-window elapsed (${effectiveEndedWindowSeconds}s after sale end). stopping...`,
      );
    } else {
      console.log(`\n[leak] window expired (${prompted.windowSeconds}s). stopping...`);
    }
    try {
      child.kill("SIGTERM");
    } catch {}
    try {
      tunnelProc?.kill("SIGTERM");
    } catch {}
  };

  const stopTimer = setTimeout(stopAll, stopAfterSeconds * 1000);

  child.on("exit", (code, signal) => {
    clearTimeout(stopTimer);
    try {
      tunnelProc?.kill("SIGTERM");
    } catch {}
    if (tunnelFatal) process.exit(1);
    if (stoppedByWindow && signal === "SIGTERM") process.exit(0);
    if (signal) {
      console.log(`[leak] server exited (signal ${signal})`);
      process.exit(1);
    } else {
      console.log(`[leak] server exited (code ${code})`);
      process.exit(code ?? 1);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
