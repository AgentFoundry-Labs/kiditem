import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts/manage-extension-release.mjs");
const deploymentTag = "staging-v0.1.26-20260725-58dacdef";
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
  const directory = mkdtempSync(join(tmpdir(), "kiditem-extension-bundle-"));
  temporaryDirectories.push(directory);
  return directory;
}

function run(
  command: "pack" | "publish",
  outputDirectory: string,
  extraArgs: string[] = [],
) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      command,
      "--deployment-tag",
      deploymentTag,
      "--output-dir",
      outputDirectory,
      ...extraArgs,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("deployment-scoped extension release management", () => {
  it("packages all three universal extensions under one deployment bundle", () => {
    const outputDirectory = temporaryDirectory();
    const result = run("pack", outputDirectory);

    expect(result.status, result.stderr).toBe(0);
    const bundleDirectory = join(outputDirectory, "bundles", deploymentTag);
    const metadataPath = join(
      bundleDirectory,
      `kiditem-extension-bundle-${deploymentTag}.release.json`,
    );
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

    expect(metadata).toMatchObject({
      schemaVersion: "kiditem.extension.release.v3",
      deploymentTag,
      target: "universal",
      environmentProfiles: ["local", "staging"],
    });
    expect(metadata.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(
      metadata.extensions.map((item: { extension: string }) => item.extension),
    ).toEqual(supportedExtensions);

    for (const extension of supportedExtensions) {
      const version = extensionVersion(extension);
      const assetBase = `kiditem-${extension}-v${version}`;
      const archivePath = join(bundleDirectory, `${assetBase}.zip`);
      const checksumPath = `${archivePath}.sha256`;
      const sourceManifestPath = join(
        repoRoot,
        "extensions",
        extension,
        "manifest.json",
      );
      const unpackedManifestPath = join(
        bundleDirectory,
        "unpacked",
        extension,
        "manifest.json",
      );

      expect(readFileSync(unpackedManifestPath)).toEqual(
        readFileSync(sourceManifestPath),
      );
      const archive = readFileSync(archivePath);
      const sha256 = createHash("sha256").update(archive).digest("hex");
      expect(readFileSync(checksumPath, "utf8")).toBe(
        `${sha256}  ${assetBase}.zip\n`,
      );
      expect(metadata.extensions).toContainEqual(
        expect.objectContaining({
          extension,
          manifestVersion: version,
          archive: expect.objectContaining({
            fileName: `${assetBase}.zip`,
            sha256,
          }),
        }),
      );
    }
  });

  it("reproduces every extension archive across bundle directories", () => {
    const firstOutput = temporaryDirectory();
    const secondOutput = temporaryDirectory();
    expect(run("pack", firstOutput).status).toBe(0);
    expect(run("pack", secondOutput).status).toBe(0);

    for (const extension of supportedExtensions) {
      const version = extensionVersion(extension);
      const fileName = `kiditem-${extension}-v${version}.zip`;
      expect(
        readFileSync(join(firstOutput, "bundles", deploymentTag, fileName)),
      ).toEqual(
        readFileSync(join(secondOutput, "bundles", deploymentTag, fileName)),
      );
    }
  });

  it("creates one GitHub prerelease command containing all bundle assets", () => {
    const outputDirectory = temporaryDirectory();
    const result = run("publish", outputDirectory, ["--dry-run", "true"]);

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.metadata.deploymentTag).toBe(deploymentTag);
    expect(output.release).toMatchObject({
      dryRun: true,
      state: "draft",
      executable: "gh",
    });
    expect(output.release.args).toEqual(
      expect.arrayContaining([
        "release",
        "create",
        deploymentTag,
        "--latest=false",
        "--prerelease",
        "--draft",
      ]),
    );
    for (const extension of supportedExtensions) {
      const version = extensionVersion(extension);
      expect(output.release.args).toContain(
        join(
          outputDirectory,
          "bundles",
          deploymentTag,
          `kiditem-${extension}-v${version}.zip`,
        ),
      );
    }
  });

  it("rejects the removed per-extension release argument", () => {
    const result = run("pack", temporaryDirectory(), [
      "--extension",
      "product-scraper",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --extension");
  });
});
