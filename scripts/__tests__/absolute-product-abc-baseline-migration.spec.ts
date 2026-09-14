import { describe, expect, it, vi } from "vitest";

const resetModulePath = "../data-migrations/v0.1.31/001_reset_absolute_product_abc.js";
const initializeModulePath = "../data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula.js";

const CURRENT_FORMULA_CHECKSUM =
  "230d35436ffd2fd42bf4eb4ea3f0c99bd7474dcf5b7cf11f6ed235aff84cc64f";

function resetMigrationTx(options: { gradeColumnPresent: boolean } = { gradeColumnPresent: true }) {
  const formulas = [{ id: "formula-1" }, { id: "formula-2" }];
  const states = [{ organizationId: "org-1" }, { organizationId: "org-2" }];
  const evaluations = [{ id: "evaluation-1" }, { id: "evaluation-2" }];
  const histories = [
    { id: "history-1" },
    { id: "history-2" },
    { id: "history-3" },
  ];
  const products = [
    { id: "master-1", abcGrade: "A" },
    { id: "master-2", abcGrade: null },
    { id: "master-3", abcGrade: "C" },
  ];

  const clear = <T>(rows: T[]) => vi.fn(async () => {
    const count = rows.length;
    rows.splice(0);
    return { count };
  });

  return {
    state: { formulas, states, evaluations, histories, products },
    tx: {
      masterProductAbcGradeHistory: { deleteMany: clear(histories) },
      masterProductAbcEvaluation: { deleteMany: clear(evaluations) },
      masterProductAbcFormulaState: { deleteMany: clear(states) },
      masterProductAbcFormulaVersion: { deleteMany: clear(formulas) },
      // The cached grade is cleared through raw SQL guarded on the column.
      $queryRaw: vi.fn(async () => [{ present: options.gradeColumnPresent }]),
      $executeRaw: vi.fn(async () => {
        let count = 0;
        for (const product of products) {
          if (product.abcGrade === null) continue;
          product.abcGrade = null;
          count += 1;
        }
        return count;
      }),
    },
  };
}

function initializeMigrationTx() {
  const organizations = [{ id: "org-1" }, { id: "org-2" }];
  const formulas: Array<Record<string, unknown>> = [];
  const states: Array<Record<string, unknown>> = [];
  let nextFormulaId = 1;

  return {
    state: { organizations, formulas, states },
    tx: {
      organization: {
        findMany: vi.fn().mockResolvedValue(organizations),
      },
      masterProductAbcFormulaVersion: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          const key = where.organizationId_formulaKey_version;
          return formulas.find(
            (formula) => formula.organizationId === key.organizationId
              && formula.formulaKey === key.formulaKey
              && formula.version === key.version,
          ) ?? null;
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const formula = { id: `formula-${nextFormulaId++}`, ...data };
          formulas.push(formula);
          return formula;
        }),
      },
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => (
          states.find((state) => state.organizationId === where.organizationId)
            ?? null
        )),
        create: vi.fn().mockImplementation(async ({ data }) => {
          states.push({ ...data });
          return data;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const state = states.find((row) => row.organizationId === where.organizationId);
          if (!state) throw new Error(`missing state for ${where.organizationId}`);
          Object.assign(state, data);
          return state;
        }),
      },
    },
  };
}

describe("absolute product ABC baseline migrations", () => {
  it("clears every legacy ABC row and grade cache before installing current formula", async () => {
    const { resetAbsoluteProductAbc } = await import(resetModulePath);
    const { tx, state } = resetMigrationTx();

    await expect(resetAbsoluteProductAbc.run(tx as never)).resolves.toEqual({
      affectedRows: 11,
      details: {
        clearedCachedGradeCount: 2,
        deletedEvaluationCount: 2,
        deletedFormulaStateCount: 2,
        deletedFormulaVersionCount: 2,
        deletedGradeHistoryCount: 3,
      },
    });
    expect({
      formulas: state.formulas.length,
      states: state.states.length,
      evaluations: state.evaluations.length,
      history: state.histories.length,
      cachedGrades: state.products.filter((product) => product.abcGrade !== null).length,
    }).toEqual({
      formulas: 0,
      states: 0,
      evaluations: 0,
      history: 0,
      cachedGrades: 0,
    });
  });

  it("clears no grade cache on a schema that no longer has the column", async () => {
    const { resetAbsoluteProductAbc } = await import(resetModulePath);
    const { tx, state } = resetMigrationTx({ gradeColumnPresent: false });

    await expect(resetAbsoluteProductAbc.run(tx as never)).resolves.toEqual({
      affectedRows: 9,
      details: {
        clearedCachedGradeCount: 0,
        deletedEvaluationCount: 2,
        deletedFormulaStateCount: 2,
        deletedFormulaVersionCount: 2,
        deletedGradeHistoryCount: 3,
      },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(state.histories).toHaveLength(0);
  });

  it("installs one immutable current formula state per organization without a publication", async () => {
    const { initializeAbsoluteProductAbcFormula } = await import(initializeModulePath);
    const { tx, state } = initializeMigrationTx();

    await expect(initializeAbsoluteProductAbcFormula.run(tx as never)).resolves.toEqual({
      affectedRows: 4,
      details: {
        createdFormulaVersionCount: 2,
        initializedFormulaStateCount: 2,
      },
    });
    expect(state.formulas).toHaveLength(2);
    expect(state.formulas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        formulaKey: "PRODUCT_ABC_ABSOLUTE",
        version: 2,
        formulaChecksum: CURRENT_FORMULA_CHECKSUM,
        formulaJson: expect.objectContaining({
          formulaKey: "PRODUCT_ABC_ABSOLUTE",
          version: 2,
          halfLifeDays: 90,
          minimumSaleAgeDays: 30,
          requiresCompleteEvaluationPeriod: true,
          maxCalendarMonths: 12,
          includePartialCutoffMonth: true,
        }),
      }),
    ]));
    expect(state.states).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationId: "org-1",
        formulaRevision: 1,
        publicationRevision: 0,
        officialCutoffDate: null,
        publishedSellpiaSourceImportRunId: null,
        publishedAdvertisingSourceImportRunId: null,
        publishedMappingGeneration: null,
        publishedAt: null,
        mappingGeneration: 0n,
      }),
    ]));

    state.states[0]!.mappingGeneration = 7n;
    await expect(initializeAbsoluteProductAbcFormula.run(tx as never)).resolves.toEqual({
      affectedRows: 0,
      details: {
        createdFormulaVersionCount: 0,
        initializedFormulaStateCount: 0,
      },
    });
    expect(state.formulas).toHaveLength(2);
    expect(state.states[0]!.mappingGeneration).toBe(7n);
  });
});
