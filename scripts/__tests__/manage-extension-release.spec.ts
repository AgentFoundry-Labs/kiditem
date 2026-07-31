import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts/manage-extension-release.mjs");
const deploymentTag = "staging-v0.1.26-20260725-58dacdef";
const bundleFileName = `kiditem-scrapers-${deploymentTag}.zip`;
// 주문수집/쿠팡/소싱 세 확장을 kiditem-os 하나로 합쳤다.
const supportedExtensions = ["kiditem-os"] as const;
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
  it("packages all three universal extensions in one ZIP", () => {
    const outputDirectory = temporaryDirectory();
    const result = run("pack", outputDirectory);

    expect(result.status, result.stderr).toBe(0);
    const bundleDirectory = join(outputDirectory, "bundles", deploymentTag);
    const metadata = JSON.parse(result.stdout).metadata;

    expect(metadata).toMatchObject({
      deploymentTag,
      target: "universal",
      environmentProfiles: ["local", "office", "staging"],
    });
    expect(metadata.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(metadata.archive.fileName).toBe(bundleFileName);
    expect(
      metadata.extensions.map((item: { extension: string }) => item.extension),
    ).toEqual(supportedExtensions);

    for (const extension of supportedExtensions) {
      const version = extensionVersion(extension);
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
      expect(metadata.extensions).toContainEqual(
        expect.objectContaining({
          extension,
          manifestVersion: version,
        }),
      );
    }

    const archivePath = join(bundleDirectory, bundleFileName);
    expect(readFileSync(archivePath).length).toBeGreaterThan(0);
    const listing = spawnSync("unzip", ["-Z1", archivePath], {
      encoding: "utf8",
    });
    expect(listing.status, listing.stderr).toBe(0);
    for (const extension of supportedExtensions) {
      expect(listing.stdout).toContain(`${extension}/manifest.json\n`);
    }
    expect(readdirSync(bundleDirectory).sort()).toEqual([
      bundleFileName,
      "unpacked",
    ]);
  });

  it("reproduces the combined archive across bundle directories", () => {
    const firstOutput = temporaryDirectory();
    const secondOutput = temporaryDirectory();
    expect(run("pack", firstOutput).status).toBe(0);
    expect(run("pack", secondOutput).status).toBe(0);

    expect(
      readFileSync(
        join(firstOutput, "bundles", deploymentTag, bundleFileName),
      ),
    ).toEqual(
      readFileSync(
        join(secondOutput, "bundles", deploymentTag, bundleFileName),
      ),
    );
  });

  it("creates one GitHub prerelease command containing only the combined ZIP", () => {
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
    expect(output.release.args).toContain(
      join(outputDirectory, "bundles", deploymentTag, bundleFileName),
    );
    expect(
      output.release.args.filter((argument: string) =>
        argument.startsWith(`${outputDirectory}/`),
      ),
    ).toHaveLength(1);
    expect(output.release.args.join("\n")).not.toMatch(
      /\.sha256|\.release\.json/,
    );
  });

  it("rejects the removed per-extension release argument", () => {
    const result = run("pack", temporaryDirectory(), [
      "--extension",
      "kiditem-os",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --extension");
  });
});
