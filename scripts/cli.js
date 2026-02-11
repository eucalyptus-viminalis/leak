#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sub = process.argv[2];

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

if (!sub || sub === "--help" || sub === "-h") {
  console.log("Usage:");
  console.log("  leak --file <path> [--price <usdc>] [--window <duration>] [--pay-to <address>] [--network <caip2>] [--port <port>] [--confirmed] [--public] [--og-title <text>] [--og-description <text>] [--og-image-url <https://...>] [--ended-window-seconds <seconds>]");
  console.log("  leak buy <download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]");
  console.log("");
  console.log("Notes:");
  console.log("  share / as promo (social card), use /download for agent-assisted purchase.");
  console.log("Backward-compatible:");
  console.log("  leak leak --file <path> ...");
  process.exit(0);
}

if (sub === "leak") {
  runSubcommand("leak.js", process.argv.slice(3));
} else if (sub === "buy") {
  runSubcommand("buy.js", process.argv.slice(3));
} else {
  // Default command: treat all args as leak-server args.
  runSubcommand("leak.js", process.argv.slice(2));
}
