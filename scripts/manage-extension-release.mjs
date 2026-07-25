#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supportedExtensions = new Set([
  "product-scraper",
  "coupang-ads-scraper",
  "order-collector",
]);
const environmentProfiles = ["local", "staging"];

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (
      !key?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(
        `Expected --name value arguments, got ${key ?? "<missing>"}`,
      );
    }
    values.set(key.slice(2), value);
  }
  return { command, values };
}

function required(values, name) {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function assertAllowedArguments(values, allowed) {
  for (const name of values.keys()) {
    if (!allowed.has(name)) {
      throw new Error(`Unsupported argument: --${name}`);
    }
  }
}

function copyLoadableExtension(sourceDirectory, outputDirectory) {
  cpSync(sourceDirectory, outputDirectory, {
    recursive: true,
    filter(source) {
      const name = basename(source);
      return (
        name !== "AGENTS.md" && name !== "CLAUDE.md" && !name.startsWith(".")
      );
    },
  });
}

function visitFiles(directory, visitor) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visitFiles(path, visitor);
    else if (entry.isFile()) visitor(path);
  }
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to resolve git SHA");
  }
  const value = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(value))
    throw new Error("Git SHA is not full length");
  return value;
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function createArchive(unpackedDirectory, archivePath) {
  const stableTimestamp = new Date("1980-01-01T00:00:00.000Z");
  const entries = [];
  visitFiles(unpackedDirectory, (path) => {
    utimesSync(path, stableTimestamp, stableTimestamp);
    entries.push(relative(unpackedDirectory, path).replaceAll("\\", "/"));
  });
  entries.sort();
  const result = spawnSync("zip", ["-X", "-q", archivePath, "-@"], {
    cwd: unpackedDirectory,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
    input: `${entries.join("\n")}\n`,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "zip failed");
  }
}

export function packExtensionRelease({
  extension,
  outputDirectory,
}) {
  if (!supportedExtensions.has(extension)) {
    throw new Error(`Unsupported extension: ${extension}`);
  }

  const sourceDirectory = join(repoRoot, "extensions", extension);
  const sourceManifest = JSON.parse(
    readFileSync(join(sourceDirectory, "manifest.json"), "utf8"),
  );
  const version = String(sourceManifest.version ?? "");
  if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
    throw new Error(`Invalid Chrome manifest version: ${version}`);
  }

  const target = "universal";
  const releaseDirectory = resolve(outputDirectory, extension, version, target);
  const unpackedDirectory = join(releaseDirectory, "unpacked");
  const assetBase = `kiditem-${extension}-v${version}`;
  const archiveFileName = `${assetBase}.zip`;
  const archivePath = join(releaseDirectory, archiveFileName);
  const checksumPath = `${archivePath}.sha256`;
  const metadataPath = join(releaseDirectory, `${assetBase}.release.json`);

  rmSync(releaseDirectory, { recursive: true, force: true });
  mkdirSync(releaseDirectory, { recursive: true });
  copyLoadableExtension(sourceDirectory, unpackedDirectory);
  const manifest = JSON.parse(
    readFileSync(join(unpackedDirectory, "manifest.json"), "utf8"),
  );
  if (manifest.version !== version) {
    throw new Error("Packaged manifest version changed");
  }

  createArchive(unpackedDirectory, archivePath);
  const archive = readFileSync(archivePath);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  writeFileSync(checksumPath, `${sha256}  ${archiveFileName}\n`);

  const metadata = {
    schemaVersion: "kiditem.extension.release.v2",
    extension,
    displayName: manifest.name,
    manifestVersion: version,
    target,
    environmentProfiles,
    gitSha: gitSha(),
    tag: `extension-${extension}-v${version}`,
    archive: {
      fileName: archiveFileName,
      sha256,
      size: statSync(archivePath).size,
    },
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return {
    archivePath,
    checksumPath,
    metadataPath,
    releaseDirectory,
    metadata,
  };
}

function assertPublishableMain(metadata) {
  const branch = gitOutput(["branch", "--show-current"]);
  if (branch !== "main")
    throw new Error("Extension Releases must be published from main");
  if (gitOutput(["status", "--porcelain"])) {
    throw new Error("Extension Releases require a clean worktree");
  }
  const remoteMainSha = gitOutput(["rev-parse", "origin/main"]);
  if (remoteMainSha !== metadata.gitSha) {
    throw new Error("HEAD must exactly match origin/main before publishing");
  }
}

export function githubReleaseCommand(result, { state = "draft" } = {}) {
  if (state !== "draft" && state !== "published") {
    throw new Error(`Unsupported release state: ${state}`);
  }
  const { metadata } = result;
  const args = [
    "release",
    "create",
    metadata.tag,
    "--target",
    metadata.gitSha,
    "--latest=false",
    "--prerelease",
    "--title",
    `${metadata.displayName} v${metadata.manifestVersion} (${metadata.target})`,
    "--notes",
    [
      `Extension: ${metadata.extension}`,
      `Manifest version: ${metadata.manifestVersion}`,
      `Target: ${metadata.target}`,
      `Environments: ${metadata.environmentProfiles.join(", ")}`,
      `Git SHA: ${metadata.gitSha}`,
    ].join("\n"),
  ];
  if (state === "draft") args.push("--draft");
  args.push(result.archivePath, result.checksumPath, result.metadataPath);
  return { executable: "gh", args, state };
}

export function publishExtensionRelease(
  result,
  { dryRun = false, state = "draft" } = {},
) {
  const command = githubReleaseCommand(result, { state });
  if (dryRun) return { ...command, dryRun: true };

  assertPublishableMain(result.metadata);
  const existing = spawnSync("gh", ["release", "view", result.metadata.tag], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (existing.status === 0) {
    throw new Error(`GitHub Release already exists: ${result.metadata.tag}`);
  }

  const published = spawnSync(command.executable, command.args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (published.status !== 0) {
    throw new Error(published.stderr.trim() || "gh release create failed");
  }
  return {
    ...command,
    dryRun: false,
    url: published.stdout.trim(),
  };
}

function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command !== "pack" && command !== "publish") {
    throw new Error("Usage: manage-extension-release.mjs <pack|publish> ...");
  }
  assertAllowedArguments(
    values,
    new Set([
      "extension",
      "output-dir",
      ...(command === "publish" ? ["dry-run", "release-state"] : []),
    ]),
  );
  const result = packExtensionRelease({
    extension: required(values, "extension"),
    outputDirectory:
      values.get("output-dir") || join(repoRoot, "output/extensions"),
  });
  const output =
    command === "publish"
      ? {
          ...result,
          release: publishExtensionRelease(result, {
            dryRun: values.get("dry-run") === "true",
            state: values.get("release-state") || "draft",
          }),
        }
      : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
