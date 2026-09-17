import { describe, expect, it, vi } from "vitest";
import {
  checkLedgerSources,
  findAppliedSourceDrift,
  preflightAppliedSourceDrift,
  sourceDriftExitCode,
  sourceDriftWarning,
  type AppliedMigrationRun,
  type LedgerRun,
  type SourceDriftEntry,
} from "../data-migrations/ledger";
import {
  classifySourceCheck,
  detailsWithRunnerSource,
  migrationSourcePath,
  recordedRunnerSourceSha256,
  RUNNER_DETAILS_KEY,
  SOURCE_HASH_ALGORITHM,
  type RunnerSourceIdentity,
  type SourceCheck,
} from "../data-migrations/source-identity";
import type { DataMigration } from "../data-migrations/types";
import { failOnSourceDriftSetting } from "../run-data-migrations";

const ALPHA = "v9.0.0:001_alpha_probe";
const BRAVO = "v9.0.0:002_bravo_probe";
const CHARLIE = "v9.0.0:003_charlie_probe";
const DELTA = "v9.0.0:004_delta_probe";
const ECHO = "v9.0.0:005_echo_probe";
const UNREGISTERED = "v0.1.21:001_backfill_inventory_commitments";
const RETIRED = "v0.1.26:001_initialize_master_product_abc_policy";
const RAN_AT = "1".repeat(40);

function sha(digit: string): string {
  return digit.repeat(64);
}

function source(migrationId: string, sourceSha256: string): RunnerSourceIdentity {
  return {
    sourcePath: migrationSourcePath(migrationId),
    sourceSha256,
    hashAlgorithm: SOURCE_HASH_ALGORITHM,
  };
}

function migration(id: string): DataMigration {
  return {
    id,
    releaseVersion: "9.0.0",
    name: id,
    run: vi.fn(async () => ({ affectedRows: 0, details: {} })),
  };
}

function appliedRun(
  status: string,
  recordedSourceSha256: string | null,
): AppliedMigrationRun {
  return { status, affectedRows: 0, gitSha: RAN_AT, recordedSourceSha256 };
}

function ledgerRun(
  migrationId: string,
  overrides: Partial<LedgerRun> = {},
): LedgerRun {
  return {
    migrationId,
    name: migrationId,
    releaseVersion: "9.0.0",
    status: "succeeded",
    affectedRows: 0,
    gitSha: RAN_AT,
    prismaSchemaHash: sha("9"),
    completedAt: null,
    error: null,
    runner: null,
    ...overrides,
  };
}

describe("source check classification", () => {
  it.each<[string, Parameters<typeof classifySourceCheck>[0], SourceCheck]>([
    [
      "retired ids",
      { registered: false, retired: true, recordedSha256: sha("a"), currentSha256: null, derivedSha256: null },
      "retired",
    ],
    [
      "ids no longer registered",
      { registered: false, retired: false, recordedSha256: sha("a"), currentSha256: null, derivedSha256: sha("a") },
      "unregistered",
    ],
    [
      "a recorded hash equal to the file",
      { registered: true, retired: false, recordedSha256: sha("a"), currentSha256: sha("a"), derivedSha256: sha("b") },
      "match",
    ],
    [
      "a recorded hash different from the file",
      { registered: true, retired: false, recordedSha256: sha("a"), currentSha256: sha("b"), derivedSha256: sha("b") },
      "drift",
    ],
    [
      "an old row whose commit has the same file",
      { registered: true, retired: false, recordedSha256: null, currentSha256: sha("a"), derivedSha256: sha("a") },
      "unrecorded-derived-match",
    ],
    [
      "an old row whose commit has a different file",
      { registered: true, retired: false, recordedSha256: null, currentSha256: sha("a"), derivedSha256: sha("b") },
      "unrecorded-derived-drift",
    ],
    [
      "an old row whose commit is unavailable",
      { registered: true, retired: false, recordedSha256: null, currentSha256: sha("a"), derivedSha256: null },
      "unrecorded-unknown",
    ],
  ])("classifies %s", (_, input, expected) => {
    expect(classifySourceCheck(input)).toBe(expected);
  });
});

describe("recorded runner source", () => {
  it("reads the hash only from a sha256-lf runner record", () => {
    expect(recordedRunnerSourceSha256(source(ALPHA, sha("a")))).toBe(sha("a"));
    for (const runner of [
      undefined,
      null,
      "sha",
      1,
      [],
      {},
      { sourceSha256: sha("a") },
      { sourceSha256: sha("a"), hashAlgorithm: "sha256" },
      { sourceSha256: sha("A"), hashAlgorithm: SOURCE_HASH_ALGORITHM },
      { sourceSha256: "a".repeat(63), hashAlgorithm: SOURCE_HASH_ALGORITHM },
    ]) {
      expect(recordedRunnerSourceSha256(runner), JSON.stringify(runner)).toBeNull();
    }
  });

  it("adds _runner to a copy of the migration details", () => {
    const details = { probe: "ok" };
    const runner = source(ALPHA, sha("a"));

    expect(detailsWithRunnerSource(ALPHA, details, runner)).toEqual({
      probe: "ok",
      [RUNNER_DETAILS_KEY]: runner,
    });
    expect(details).toEqual({ probe: "ok" });
  });

  it("refuses migration details that use the reserved key or are not an object", () => {
    const runner = source(ALPHA, sha("a"));

    expect(() =>
      detailsWithRunnerSource(ALPHA, { _runner: "mine" }, runner),
    ).toThrow(/details\._runner, a key reserved for the runner/);
    expect(() =>
      detailsWithRunnerSource(ALPHA, { _runner: undefined }, runner),
    ).toThrow(/reserved/);
    for (const details of [null, [], "details"]) {
      expect(() =>
        detailsWithRunnerSource(
          ALPHA,
          details as unknown as Record<string, unknown>,
          runner,
        ),
      ).toThrow(/must return a details object/);
    }
  });
});

describe("fail-on-source-drift setting", () => {
  it("defaults to warning and lets the option override the environment", () => {
    expect(failOnSourceDriftSetting(undefined, undefined)).toBe(false);
    expect(failOnSourceDriftSetting(undefined, "")).toBe(false);
    expect(failOnSourceDriftSetting(undefined, "0")).toBe(false);
    expect(failOnSourceDriftSetting(undefined, "1")).toBe(true);
    expect(failOnSourceDriftSetting(undefined, " TRUE ")).toBe(true);
    expect(failOnSourceDriftSetting(true, "0")).toBe(true);
    expect(failOnSourceDriftSetting("1", undefined)).toBe(true);
    expect(failOnSourceDriftSetting("false", "1")).toBe(false);
  });

  it("rejects values other than 1, 0, true, and false", () => {
    expect(() => failOnSourceDriftSetting(undefined, "yes")).toThrow(
      /accept 1, 0, true, or false/,
    );
    expect(() => failOnSourceDriftSetting("2", undefined)).toThrow(
      /accept 1, 0, true, or false/,
    );
  });
});

describe("up source drift preflight", () => {
  const selected = [ALPHA, BRAVO, CHARLIE, DELTA, ECHO].map(migration);
  const current = new Map([
    [ALPHA, source(ALPHA, sha("2"))],
    [BRAVO, source(BRAVO, sha("3"))],
    [CHARLIE, source(CHARLIE, sha("4"))],
    [DELTA, source(DELTA, sha("5"))],
    [ECHO, source(ECHO, sha("6"))],
  ]);
  const ledger = new Map<string, AppliedMigrationRun>([
    // Ran from an older source: skipped again, so it is drift.
    [ALPHA, appliedRun("succeeded", sha("1"))],
    [BRAVO, appliedRun("succeeded", sha("3"))],
    // Written before sources were recorded.
    [CHARLIE, appliedRun("succeeded", null)],
    // Runs again from the current file.
    [DELTA, appliedRun("failed", sha("9"))],
    // No longer registered; up never selects it.
    [UNREGISTERED, appliedRun("succeeded", sha("8"))],
  ]);
  const expectedDrift: SourceDriftEntry = {
    migrationId: ALPHA,
    sourceCheck: "drift",
    sourcePath: migrationSourcePath(ALPHA),
    ranSourceSha256: sha("1"),
    currentSourceSha256: sha("2"),
    gitSha: RAN_AT,
  };

  function reader() {
    return vi.fn(async (migrationId: string) => ledger.get(migrationId) ?? null);
  }

  it("reports only succeeded selected ids whose recorded source changed, reading no other ids", async () => {
    const readRun = reader();

    await expect(findAppliedSourceDrift(selected, current, readRun)).resolves.toEqual([
      expectedDrift,
    ]);
    expect(readRun.mock.calls.map(([migrationId]) => migrationId)).toEqual([
      ALPHA,
      BRAVO,
      CHARLIE,
      DELTA,
      ECHO,
    ]);
  });

  it("warns on each drifted migration and continues by default", async () => {
    const warn = vi.fn();

    await expect(
      preflightAppliedSourceDrift(selected, current, reader(), {
        failOnSourceDrift: false,
        warn,
      }),
    ).resolves.toEqual([expectedDrift]);
    expect(warn.mock.calls).toEqual([[sourceDriftWarning(expectedDrift)]]);
    expect(sourceDriftWarning(expectedDrift)).toBe(
      `Data migration ${ALPHA} ran from source ${sha("1")}, but ` +
        `${migrationSourcePath(ALPHA)} is now ${sha("2")}. ` +
        "It will not run again; a fix needs a new migration id.",
    );
    for (const selectedMigration of selected) {
      expect(selectedMigration.run).not.toHaveBeenCalled();
    }
  });

  it("throws after warning when failing on drift is requested", async () => {
    const warn = vi.fn();

    await expect(
      preflightAppliedSourceDrift(selected, current, reader(), {
        failOnSourceDrift: true,
        warn,
      }),
    ).rejects.toThrow(
      `Refusing to run data migrations: source drift was found in 1 applied migration(s) (${ALPHA})`,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("passes with the flag when nothing drifted", async () => {
    const warn = vi.fn();

    await expect(
      preflightAppliedSourceDrift(selected.slice(1), current, reader(), {
        failOnSourceDrift: true,
        warn,
      }),
    ).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("requires a source identity for every selected migration", async () => {
    await expect(
      findAppliedSourceDrift([migration("v9.0.0:099_unread_probe")], current, reader()),
    ).rejects.toThrow(/No source identity was read for data migration v9\.0\.0:099_unread_probe/);
  });
});

describe("status source check", () => {
  const current = new Map([
    [ALPHA, source(ALPHA, sha("2"))],
    [BRAVO, source(BRAVO, sha("3"))],
    [CHARLIE, source(CHARLIE, sha("4"))],
    [DELTA, source(DELTA, sha("5"))],
    [ECHO, source(ECHO, sha("6"))],
  ]);
  const retiredIds = new Set([RETIRED]);
  const oldCommit = "2".repeat(40);
  const unknownCommit = "3".repeat(40);

  it("labels every row, derives old rows from git, and lists only succeeded drift", async () => {
    const runs = [
      ledgerRun(ALPHA, { runner: source(ALPHA, sha("1")) }),
      ledgerRun(BRAVO, { runner: source(BRAVO, sha("3")) }),
      ledgerRun(CHARLIE, { gitSha: oldCommit }),
      ledgerRun(DELTA, { gitSha: unknownCommit }),
      ledgerRun(ECHO, { status: "failed", runner: source(ECHO, sha("7")) }),
      ledgerRun(UNREGISTERED, { runner: "not a runner record" }),
      ledgerRun(RETIRED, { runner: source(RETIRED, sha("8")) }),
      ledgerRun("v0.0.1:999_removed_probe", { status: "failed", gitSha: null }),
    ];
    const deriveSourceSha256 = vi.fn(async (commit: string, sourcePath: string) => {
      if (commit === oldCommit && sourcePath === migrationSourcePath(CHARLIE)) {
        return sha("0");
      }
      return null;
    });

    const report = await checkLedgerSources(runs, {
      current,
      retiredIds,
      deriveSourceSha256,
    });

    expect(
      report.runs.map(({ migrationId, sourceCheck }) => [migrationId, sourceCheck]),
    ).toEqual([
      [ALPHA, "drift"],
      [BRAVO, "match"],
      [CHARLIE, "unrecorded-derived-drift"],
      [DELTA, "unrecorded-unknown"],
      [ECHO, "drift"],
      [UNREGISTERED, "unregistered"],
      [RETIRED, "retired"],
      ["v0.0.1:999_removed_probe", "unregistered"],
    ]);
    expect(report.runs[0]).toEqual({ ...runs[0], sourceCheck: "drift" });
    expect(report.sourceDrift).toEqual([
      {
        migrationId: ALPHA,
        sourceCheck: "drift",
        sourcePath: migrationSourcePath(ALPHA),
        ranSourceSha256: sha("1"),
        currentSourceSha256: sha("2"),
        gitSha: RAN_AT,
      },
      {
        migrationId: CHARLIE,
        sourceCheck: "unrecorded-derived-drift",
        sourcePath: migrationSourcePath(CHARLIE),
        ranSourceSha256: sha("0"),
        currentSourceSha256: sha("4"),
        gitSha: oldCommit,
      },
    ]);
    expect(deriveSourceSha256.mock.calls).toEqual([
      [oldCommit, migrationSourcePath(CHARLIE)],
      [unknownCommit, migrationSourcePath(DELTA)],
    ]);
  });

  it("fails status only for recorded drift and only when asked", () => {
    const recorded: SourceDriftEntry = {
      migrationId: ALPHA,
      sourceCheck: "drift",
      sourcePath: migrationSourcePath(ALPHA),
      ranSourceSha256: sha("1"),
      currentSourceSha256: sha("2"),
      gitSha: RAN_AT,
    };
    const derived: SourceDriftEntry = {
      ...recorded,
      migrationId: CHARLIE,
      sourceCheck: "unrecorded-derived-drift",
      sourcePath: migrationSourcePath(CHARLIE),
    };

    expect(sourceDriftExitCode([], true)).toBe(0);
    expect(sourceDriftExitCode([recorded, derived], false)).toBe(0);
    expect(sourceDriftExitCode([derived], true)).toBe(0);
    expect(sourceDriftExitCode([derived, recorded], true)).toBe(3);
  });
});
