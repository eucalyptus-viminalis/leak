#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";

const sub = process.argv[2];

if (!sub || sub === "--help" || sub === "-h") {
  console.log("Usage:");
  console.log("  leak leak --file <path> [--price <usdc>] [--window <duration>] [--pay-to <address>] [--network <caip2>] [--port <port>] [--confirmed] [--public]");
  console.log("  leak buy <download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]");
  process.exit(0);
}

if (sub === "leak") {
  const child = spawn(process.execPath, [path.resolve("scripts/leak.js"), ...process.argv.slice(3)], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (sub === "buy") {
  const child = spawn(process.execPath, [path.resolve("scripts/buy.js"), ...process.argv.slice(3)], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.error(`Unknown subcommand: ${sub}`);
  process.exit(1);
}
