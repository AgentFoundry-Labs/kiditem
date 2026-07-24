import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts/manage-extension-release.mjs");
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "kiditem-extension-release-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("manual extension release management", () => {
  it("packages a reproducible staging-targeted release from its manifest version", async () => {
    const outputDirectory = temporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "pack",
        "--extension",
        "order-collector",
        "--target",
        "staging",
        "--web-origin",
        "https://staging.example.com",
        "--api-origin",
        "https://staging.example.com",
        "--output-dir",
        outputDirectory,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);

    const releaseDirectory = join(
      outputDirectory,
      "order-collector",
      "0.1.80",
      "staging",
    );
    const assetBase = "kiditem-order-collector-v0.1.80-staging";
    const archivePath = join(releaseDirectory, `${assetBase}.zip`);
    const checksumPath = join(releaseDirectory, `${assetBase}.zip.sha256`);
    const metadataPath = join(releaseDirectory, `${assetBase}.release.json`);
    const unpackedManifestPath = join(
      releaseDirectory,
      "unpacked",
      "manifest.json",
    );
    const unpackedWorkerPath = join(
      releaseDirectory,
      "unpacked",
      "background/service-worker.js",
    );

    const manifest = JSON.parse(readFileSync(unpackedManifestPath, "utf8"));
    expect(manifest.version).toBe("0.1.80");
    expect(manifest.externally_connectable.matches).toEqual([
      "https://staging.example.com/*",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("localhost");
    expect(readFileSync(unpackedWorkerPath, "utf8")).not.toContain(
      "http://localhost:3000",
    );

    const archive = readFileSync(archivePath);
    const checksum = createHash("sha256").update(archive).digest("hex");
    expect(readFileSync(checksumPath, "utf8")).toBe(
      `${checksum}  ${assetBase}.zip\n`,
    );

    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    expect(metadata).toMatchObject({
      schemaVersion: "kiditem.extension.release.v1",
      extension: "order-collector",
      manifestVersion: "0.1.80",
      target: "staging",
      webOrigin: "https://staging.example.com",
      apiOrigin: "https://staging.example.com",
      tag: "extension-order-collector-v0.1.80-staging",
      archive: {
        fileName: `${assetBase}.zip`,
        sha256: checksum,
      },
    });
    expect(metadata.gitSha).toMatch(/^[0-9a-f]{40}$/);

    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const repeatedOutputDirectory = temporaryDirectory();
    const repeated = spawnSync(
      process.execPath,
      [
        scriptPath,
        "pack",
        "--extension",
        "order-collector",
        "--target",
        "staging",
        "--web-origin",
        "https://staging.example.com",
        "--api-origin",
        "https://staging.example.com",
        "--output-dir",
        repeatedOutputDirectory,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(repeated.status, repeated.stderr).toBe(0);
    const repeatedArchive = readFileSync(
      join(
        repeatedOutputDirectory,
        "order-collector",
        "0.1.80",
        "staging",
        `${assetBase}.zip`,
      ),
    );
    expect(createHash("sha256").update(repeatedArchive).digest("hex")).toBe(
      checksum,
    );
  });

  it("prepares a draft GitHub Release command bound to the packaged tag and git SHA", () => {
    const outputDirectory = temporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "publish",
        "--extension",
        "coupang-ads-scraper",
        "--target",
        "staging",
        "--web-origin",
        "https://staging.example.com",
        "--api-origin",
        "https://staging.example.com",
        "--output-dir",
        outputDirectory,
        "--dry-run",
        "true",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    const packagedManifest = JSON.parse(
      readFileSync(
        join(
          outputDirectory,
          "coupang-ads-scraper",
          "1.2.69",
          "staging",
          "unpacked",
          "manifest.json",
        ),
        "utf8",
      ),
    );
    expect(packagedManifest.host_permissions).toContain(
      "http://localhost:9000/*",
    );
    expect(
      readFileSync(
        join(
          outputDirectory,
          "coupang-ads-scraper",
          "1.2.69",
          "staging",
          "unpacked",
          "popup",
          "popup.html",
        ),
        "utf8",
      ),
    ).not.toContain("localhost:4000");
    const output = JSON.parse(result.stdout);
    expect(output.metadata.tag).toBe(
      "extension-coupang-ads-scraper-v1.2.69-staging",
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

  it("keeps distinct web and API origins separate during packaging", () => {
    const outputDirectory = temporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "pack",
        "--extension",
        "product-scraper",
        "--target",
        "staging",
        "--web-origin",
        "https://web.example.com",
        "--api-origin",
        "https://staging.merchon.org",
        "--output-dir",
        outputDirectory,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    const background = readFileSync(
      join(
        outputDirectory,
        "product-scraper",
        "2.2.3",
        "staging",
        "unpacked",
        "background.js",
      ),
      "utf8",
    );
    expect(background).toContain(
      "https://staging.merchon.org/api/sourcing/extension",
    );
    expect(background).toContain("https://web.example.com/*");
    expect(background).not.toContain(
      "https://web.example.com/api/sourcing/extension",
    );
  });
});
