import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dataMigrations,
  retiredDataMigrations,
} from "../data-migrations/index";
import {
  MIGRATION_ID_PATTERN,
  migrationSourcePath,
  normalizedSourceSha256,
  SOURCE_HASH_ALGORITHM,
} from "../data-migrations/source-identity";
import {
  dataMigrationRegistryStatus,
  migrationSourceIdentity,
} from "../run-data-migrations";

const repoRoot = join(__dirname, "..", "..");
const CARRIAGE_RETURN = 0x0d;

function rawSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("data migration source path", () => {
  it("maps a versioned migration id to its release folder file", () => {
    expect(
      migrationSourcePath(
        "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
      ),
    ).toBe(
      "scripts/data-migrations/v0.1.31/013_remove_retired_account_kpi_and_ad_tier_rows.ts",
    );
    expect(migrationSourcePath("v1.2.3-rc.1:001_probe")).toBe(
      "scripts/data-migrations/v1.2.3-rc.1/001_probe.ts",
    );
  });

  it.each([
    "ensure:source_import_run_status_check",
    "v0.1.31:../001_escape",
    "v0.1.31:001_escape/../../outside",
    "v0.1.31:001_back\\slash",
    "v0.1.31/001_slash",
    "v0.1.31:001_Upper",
    "v0.1.31:01_short_sequence",
    "v0.1.31:001_name.ts",
    "v0.1.31:001_trailing_newline\n",
    "0.1.31:001_missing_prefix",
    "v0.1:001_short_version",
    "",
  ])("rejects %j", (migrationId) => {
    expect(() => migrationSourcePath(migrationId)).toThrow(
      /not a versioned data migration id/,
    );
  });
});

describe("registered data migration sources", () => {
  it("maps every registered id to an existing file that declares that id", () => {
    expect(dataMigrations.length).toBeGreaterThan(0);
    for (const migration of dataMigrations) {
      expect(migration.id).toMatch(MIGRATION_ID_PATTERN);
      const sourcePath = migrationSourcePath(migration.id);
      expect(sourcePath).toBe(
        `scripts/data-migrations/v${migration.releaseVersion}/${migration.id.slice(migration.id.indexOf(":") + 1)}.ts`,
      );
      const absolutePath = join(repoRoot, sourcePath);
      expect(existsSync(absolutePath), sourcePath).toBe(true);
      expect(readFileSync(absolutePath, "utf8")).toMatch(
        new RegExp(`\\bid\\s*:\\s*["']${escapeRegExp(migration.id)}["']`),
      );
    }
  });

  it("reports every registered migration with the normalized hash of its file", () => {
    const registry = dataMigrationRegistryStatus();

    expect(registry.migrations.map(({ id }) => id)).toEqual(
      dataMigrations.map(({ id }) => id),
    );
    for (const migration of registry.migrations) {
      const bytes = readFileSync(join(repoRoot, migration.sourcePath));
      expect(migration.sourceSha256).toBe(normalizedSourceSha256(bytes));
      expect(migrationSourceIdentity(migration.id)).toEqual({
        sourcePath: migration.sourcePath,
        sourceSha256: migration.sourceSha256,
        hashAlgorithm: SOURCE_HASH_ALGORITHM,
      });
    }
  });

  it("reads sources from the repository root, whatever the working directory is", () => {
    const migrationId = dataMigrations[0].id;
    const expected = normalizedSourceSha256(
      readFileSync(join(repoRoot, migrationSourcePath(migrationId))),
    );
    const workingDirectory = process.cwd();
    const elsewhere = mkdtempSync(join(tmpdir(), "data-migration-cwd-"));
    try {
      process.chdir(elsewhere);
      expect(migrationSourceIdentity(migrationId).sourceSha256).toBe(expected);
    } finally {
      process.chdir(workingDirectory);
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("gives a CRLF checkout of a migration the same identity as the LF file", () => {
    const migrationId = "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows";
    const sourcePath = migrationSourcePath(migrationId);
    const lfBytes = readFileSync(join(repoRoot, sourcePath));
    expect(lfBytes.includes(CARRIAGE_RETURN)).toBe(false);

    const windowsCheckout = mkdtempSync(join(tmpdir(), "data-migration-crlf-"));
    try {
      const crlfPath = join(windowsCheckout, sourcePath);
      mkdirSync(dirname(crlfPath), { recursive: true });
      writeFileSync(crlfPath, lfBytes.toString("utf8").replace(/\n/g, "\r\n"));
      expect(readFileSync(crlfPath).includes(CARRIAGE_RETURN)).toBe(true);

      expect(migrationSourceIdentity(migrationId, windowsCheckout)).toEqual(
        migrationSourceIdentity(migrationId),
      );
      expect(migrationSourceIdentity(migrationId).sourceSha256).toBe(
        rawSha256(lfBytes),
      );
    } finally {
      rmSync(windowsCheckout, { recursive: true, force: true });
    }
  });
});

describe("normalized source hash", () => {
  it("hashes CRLF and LF text alike, and LF text like its raw bytes", () => {
    const lf = 'export const probe = "ü";\nexport const next = 2;\n';
    const crlf = lf.replace(/\n/g, "\r\n");

    expect(normalizedSourceSha256(Buffer.from(crlf))).toBe(
      normalizedSourceSha256(Buffer.from(lf)),
    );
    expect(normalizedSourceSha256(crlf)).toBe(normalizedSourceSha256(lf));
    expect(normalizedSourceSha256(Buffer.from(lf))).toBe(
      rawSha256(Buffer.from(lf)),
    );
  });

  it("changes only carriage returns that end a line", () => {
    expect(normalizedSourceSha256("a\rb")).toBe(rawSha256(Buffer.from("a\rb")));
    expect(normalizedSourceSha256("a\rb")).not.toBe(normalizedSourceSha256("a\nb"));
    expect(normalizedSourceSha256("a\r\r\nb")).toBe(
      rawSha256(Buffer.from("a\r\nb")),
    );
    expect(normalizedSourceSha256("a\r")).toBe(rawSha256(Buffer.from("a\r")));
    const bytes = Uint8Array.from([0xff, 0x0d, 0x0a, 0xfe, 0x0d]);
    expect(normalizedSourceSha256(bytes)).toBe(
      rawSha256(Uint8Array.from([0xff, 0x0a, 0xfe, 0x0d])),
    );
  });

  it("equals the raw-byte hash retired.json records for every retired source", () => {
    expect(retiredDataMigrations.length).toBeGreaterThan(0);
    for (const entry of retiredDataMigrations) {
      const bytes = readFileSync(join(repoRoot, entry.sourcePath));
      expect(rawSha256(bytes), entry.sourcePath).toBe(entry.sourceSha256);
      expect(normalizedSourceSha256(bytes), entry.sourcePath).toBe(
        entry.sourceSha256,
      );
      expect(migrationSourcePath(entry.id)).toBe(entry.sourcePath);
    }
  });
});
