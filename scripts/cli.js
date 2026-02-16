#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_JSON_PATH = path.resolve(__dirname, "..", "package.json");

const sub = process.argv[2];

function readVersion() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    const version = String(parsed?.version || "").trim();
    return version || "unknown";
  } catch {
    return "unknown";
  }
}

function printVersion() {
  console.log(`leak-cli ${readVersion()}`);
}

function printHelp() {
  console.log("Leak CLI");
  console.log("");
  console.log("Usage:");
  console.log("  leak publish [prefill flags]");
  console.log("  leak --file <path> [publish flags]");
  console.log("  leak buy <promo_or_download_url> [buy flags]");
  console.log("  leak config [show|--write-env]");
  console.log("  leak version");
  console.log("");
  console.log("Publish Flags:");
  console.log("  --access-mode <mode>");
  console.log("  --download-code <code> | --download-code-stdin");
  console.log("  --price <usdc> --window <duration>");
  console.log("  --pay-to <address> --network <caip2> --port <port>");
  console.log("  --confirmed --public --og-title --og-description --og-image-url");
  console.log("");
  console.log("Buy Flags:");
  console.log("  --download-code <code> | --download-code-stdin");
  console.log("  --buyer-private-key-file <path> | --buyer-private-key-stdin");
  console.log("  --out <path> | --basename <name>");
  console.log("");
  console.log("Examples:");
  console.log("  leak publish");
  console.log("  leak publish --file ./song.mp3 --access-mode download-code-only-no-payment");
  console.log("  leak --file ./song.mp3 --access-mode payment-only-no-download-code");
  console.log("  leak --file ./song.mp3 --access-mode download-code-only-no-payment --download-code \"friends-only\"");
  console.log("  leak buy https://xxxx.trycloudflare.com/ --download-code \"friends-only\"");
  console.log("  leak config");
  console.log("  leak version");
  console.log("");
  console.log("Notes:");
  console.log("  share / as promo (social card); buy can start from / or /download.");
  console.log("  buyer private key is required only when seller access mode includes payment.");
  console.log("Backward-compatible:");
  console.log("  leak leak --file <path> ...");
}

function runSubcommand(scriptName, argv) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const child = spawn(process.execPath, [scriptPath, ...argv], {
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`Failed to launch ${scriptName}: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`${scriptName} exited via signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
  printHelp();
  process.exit(0);
}

if (sub === "--version" || sub === "-v" || sub === "version") {
  printVersion();
  process.exit(0);
}

if (sub === "leak") {
  runSubcommand("leak.js", process.argv.slice(3));
} else if (sub === "publish") {
  runSubcommand("leak.js", ["--wizard", ...process.argv.slice(3)]);
} else if (sub === "buy") {
  runSubcommand("buy.js", process.argv.slice(3));
} else if (sub === "config") {
  runSubcommand("config.js", process.argv.slice(3));
} else {
  // Default command: treat all args as leak-server args.
  runSubcommand("leak.js", process.argv.slice(2));
}
