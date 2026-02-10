#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn } from "node:child_process";

function usageAndExit(code = 1) {
  console.log(`Usage: leak --file <path> [--price <usdc>] [--window <duration>] [--pay-to <address>] [--network <caip2>] [--port <port>] [--confirmed] [--public]`);
  console.log(`Examples:`);
  console.log(`  npm run leak -- --file ./vape.jpg`);
  console.log(`  npm run leak -- --file ./vape.jpg --price 0.01 --window 1h --confirmed`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
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
  }
  return args;
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

  const fileArg = args.file;
  if (!fileArg) usageAndExit(1);

  const artifactPath = resolveFile(fileArg);
  if (!fs.existsSync(artifactPath)) {
    console.error(`File not found: ${artifactPath}`);
    process.exit(1);
  }

  const payTo = args["pay-to"] || process.env.SELLER_PAY_TO;
  if (!payTo) {
    console.error("Missing --pay-to or SELLER_PAY_TO in env");
    process.exit(1);
  }

  const network = args.network || process.env.CHAIN_ID || "eip155:84532";
  const port = Number(args.port || process.env.PORT || 4021);

  const confirmationPolicy = args.confirmed ? "confirmed" : (process.env.CONFIRMATION_POLICY || "optimistic");

  const price = args.price || process.env.PRICE_USD; // we keep env name for compatibility
  const windowRaw = args.window || process.env.WINDOW_SECONDS;
  const windowSeconds = typeof windowRaw === "string" ? parseDurationToSeconds(windowRaw) : Number(windowRaw);

  const prompted = await promptMissing({ price, windowSeconds: windowSeconds || null });

  // Spawn the server with explicit env so there's no confusion.
  const env = {
    ...process.env,
    PORT: String(port),
    SELLER_PAY_TO: payTo,
    PRICE_USD: String(prompted.price),
    CHAIN_ID: String(network),
    WINDOW_SECONDS: String(prompted.windowSeconds),
    CONFIRMATION_POLICY: confirmationPolicy,
    ARTIFACT_PATH: artifactPath,
  };

  console.log("\nLeak config:");
  console.log(`- file:   ${artifactPath}`);
  console.log(`- price:  ${prompted.price} USDC`);
  console.log(`- window: ${prompted.windowSeconds}s`);
  console.log(`- to:     ${payTo}`);
  console.log(`- net:    ${network}`);
  console.log(`- mode:   ${confirmationPolicy}`);

  const child = spawn(process.execPath, [path.resolve("src/index.js")], {
    env,
    stdio: "inherit",
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

    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;
    const onData = (chunk) => {
      const s = chunk.toString("utf8");
      const m = s.match(urlRegex);
      if (m && m[0]) {
        console.log(`\n[leak] public URL: ${m[0]}`);
        console.log(`[leak] share link: ${m[0]}/download`);
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
    console.log(`\n[leak] window expired (${prompted.windowSeconds}s). stopping...`);
    try {
      child.kill("SIGTERM");
    } catch {}
    try {
      tunnelProc?.kill("SIGTERM");
    } catch {}
  };

  const stopTimer = setTimeout(stopAll, prompted.windowSeconds * 1000);

  child.on("exit", (code, signal) => {
    clearTimeout(stopTimer);
    try {
      tunnelProc?.kill("SIGTERM");
    } catch {}
    if (signal) {
      console.log(`[leak] server exited (signal ${signal})`);
    } else {
      console.log(`[leak] server exited (code ${code})`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
