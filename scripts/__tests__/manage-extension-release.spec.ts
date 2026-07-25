import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts/manage-extension-release.mjs");
const supportedExtensions = [
  "product-scraper",
  "coupang-ads-scraper",
  "order-collector",
] as const;
const temporaryDirectories: string[] = [];

function extensionVersion(extension: string): string {
  const manifest = JSON.parse(
    readFileSync(
      join(repoRoot, "extensions", extension, "manifest.json"),
      "utf8",
    ),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new Error(`${extension} manifest version is missing`);
  }
  return manifest.version;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "kiditem-extension-release-"));
  temporaryDirectories.push(directory);
  return directory;
}

function loadableSourceFiles(directory: string): string[] {
  const files: string[] = [];
  function visit(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "AGENTS.md" ||
        entry.name === "CLAUDE.md"
      ) {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(directory, path));
    }
  }
  visit(directory);
  return files.sort();
}

function pack(extension: string, outputDirectory: string) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      "pack",
      "--extension",
      extension,
      "--output-dir",
      outputDirectory,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("manual extension release management", () => {
  it("packages a reproducible universal release from its manifest version", async () => {
    const version = extensionVersion("order-collector");
    const outputDirectory = temporaryDirectory();
    const result = pack("order-collector", outputDirectory);

    expect(result.status, result.stderr).toBe(0);

    const releaseDirectory = join(
      outputDirectory,
      "order-collector",
      version,
      "universal",
    );
    const assetBase = `kiditem-order-collector-v${version}`;
    const archivePath = join(releaseDirectory, `${assetBase}.zip`);
    const checksumPath = join(releaseDirectory, `${assetBase}.zip.sha256`);
    const metadataPath = join(releaseDirectory, `${assetBase}.release.json`);
    const sourceManifestPath = join(
      repoRoot,
      "extensions/order-collector/manifest.json",
    );
    const unpackedManifestPath = join(
      releaseDirectory,
      "unpacked",
      "manifest.json",
    );

    expect(readFileSync(unpackedManifestPath)).toEqual(
      readFileSync(sourceManifestPath),
    );
    const manifest = JSON.parse(readFileSync(unpackedManifestPath, "utf8"));
    expect(manifest.externally_connectable.matches).toEqual(
      expect.arrayContaining([
        "http://localhost:3000/*",
        "https://staging.merchon.org/*",
      ]),
    );

    const archive = readFileSync(archivePath);
    const checksum = createHash("sha256").update(archive).digest("hex");
    expect(readFileSync(checksumPath, "utf8")).toBe(
      `${checksum}  ${assetBase}.zip\n`,
    );

    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    expect(metadata).toMatchObject({
      schemaVersion: "kiditem.extension.release.v2",
      extension: "order-collector",
      manifestVersion: version,
      target: "universal",
      environmentProfiles: ["local", "staging"],
      tag: `extension-order-collector-v${version}`,
      archive: {
        fileName: `${assetBase}.zip`,
        sha256: checksum,
      },
    });
    expect(metadata).not.toHaveProperty("webOrigin");
    expect(metadata).not.toHaveProperty("apiOrigin");
    expect(metadata.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(statSync(archivePath).size).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const repeatedOutputDirectory = temporaryDirectory();
    const repeated = pack("order-collector", repeatedOutputDirectory);
    expect(repeated.status, repeated.stderr).toBe(0);
    const repeatedArchive = readFileSync(
      join(
        repeatedOutputDirectory,
        "order-collector",
        version,
        "universal",
        `${assetBase}.zip`,
      ),
    );
    expect(createHash("sha256").update(repeatedArchive).digest("hex")).toBe(
      checksum,
    );
  });

  it("prepares a draft GitHub Release command bound to the universal package", () => {
    const version = extensionVersion("coupang-ads-scraper");
    const outputDirectory = temporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "publish",
        "--extension",
        "coupang-ads-scraper",
        "--output-dir",
        outputDirectory,
        "--dry-run",
        "true",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.metadata.tag).toBe(
      `extension-coupang-ads-scraper-v${version}`,
    );
    expect(output.release).toMatchObject({
      dryRun: true,
      state: "draft",
      executable: "gh",
    });
    expect(output.release.args).toEqual(
      expect.arrayContaining([
        "release",
        "create",
        output.metadata.tag,
        "--target",
        output.metadata.gitSha,
        "--latest=false",
        "--prerelease",
        "--draft",
        output.archivePath,
        output.checksumPath,
        output.metadataPath,
      ]),
    );
  });

  it("rejects removed environment-targeting package arguments", () => {
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "pack",
        "--extension",
        "order-collector",
        "--target",
        "staging",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --target");
  });

  it.each(supportedExtensions)(
    "copies every loadable %s source file without environment rewriting",
    (extension) => {
      const version = extensionVersion(extension);
      const outputDirectory = temporaryDirectory();
      const result = pack(extension, outputDirectory);
      expect(result.status, result.stderr).toBe(0);

      const sourceDirectory = join(repoRoot, "extensions", extension);
      const unpackedDirectory = join(
        outputDirectory,
        extension,
        version,
        "universal",
        "unpacked",
      );
      const sourceFiles = loadableSourceFiles(sourceDirectory);
      expect(loadableSourceFiles(unpackedDirectory)).toEqual(sourceFiles);
      for (const file of sourceFiles) {
        expect(readFileSync(join(unpackedDirectory, file))).toEqual(
          readFileSync(join(sourceDirectory, file)),
        );
      }
    },
  );
});
