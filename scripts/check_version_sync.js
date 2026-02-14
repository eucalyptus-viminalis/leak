#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function extractSkillVersion(skillMd) {
  const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;
  const versionLine = frontmatter[1]
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("version:"));
  if (!versionLine) return null;
  return versionLine.slice("version:".length).trim();
}

function isSupportedVersion(v) {
  return /^\d{4}\.\d{1,2}\.\d+(?:-beta\.\d+)?$/.test(v);
}

const pkgPath = path.join(repoRoot, "package.json");
const skillPath = path.join(repoRoot, "skills", "leak", "SKILL.md");

const pkgVersion = String(readJson(pkgPath).version || "").trim();
const skillVersion = String(extractSkillVersion(readText(skillPath)) || "").trim();

if (!pkgVersion) {
  console.error("[version-sync] package.json is missing version");
  process.exit(1);
}

if (!skillVersion) {
  console.error("[version-sync] skills/leak/SKILL.md is missing frontmatter version");
  process.exit(1);
}

if (pkgVersion !== skillVersion) {
  console.error(`[version-sync] mismatch: package.json=${pkgVersion} skills/leak/SKILL.md=${skillVersion}`);
  process.exit(1);
}

if (!isSupportedVersion(pkgVersion)) {
  console.error(`[version-sync] invalid version format: ${pkgVersion}`);
  console.error("[version-sync] expected YYYY.M.P or YYYY.M.P-beta.N");
  process.exit(1);
}

console.log(`[version-sync] ok: ${pkgVersion}`);
