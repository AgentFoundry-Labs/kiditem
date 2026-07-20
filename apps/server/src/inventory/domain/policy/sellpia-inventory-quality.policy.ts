import type {
  SellpiaInventoryQualityIssue,
  SellpiaInventoryQualityReport,
} from '@kiditem/shared/sellpia-inventory-freshness';

export type SellpiaInventoryQualityFactCode =
  | 'missing_name'
  | 'missing_barcode'
  | 'missing_price'
  | 'duplicate_barcode';

export type SellpiaInventoryQualityFact = {
  code: SellpiaInventoryQualityFactCode;
  rowNumber: number;
  productCode: string;
};

export type SellpiaInventoryQualityInput = {
  fileHash: string;
  previousRowCount: number;
  previousActiveProductCodes: string[];
  incomingProductCodes: string[];
  facts: SellpiaInventoryQualityFact[];
  confirmedReferencedProductCodes: string[];
};

export type SellpiaInventoryQualityResult = {
  blocked: boolean;
  report: SellpiaInventoryQualityReport;
};

const SAMPLE_LIMIT = 10;

export function evaluateSellpiaInventoryQuality(
  input: SellpiaInventoryQualityInput,
): SellpiaInventoryQualityResult {
  const issues: SellpiaInventoryQualityIssue[] = [];
  const previousCodes = new Set(input.previousActiveProductCodes);
  const incomingCodes = new Set(input.incomingProductCodes);
  const lostCodes = [...previousCodes].filter((code) => !incomingCodes.has(code));
  const newCodes = [...incomingCodes].filter((code) => !previousCodes.has(code));

  const lostRows = Math.max(0, input.previousRowCount - input.incomingProductCodes.length);
  if (input.previousRowCount > 0 && reachesThirtyPercent(lostRows, input.previousRowCount)) {
    issues.push(issue({
      code: 'row_loss_threshold_exceeded',
      severity: 'error',
      count: lostRows,
    }));
  }
  if (
    previousCodes.size > 0
    && reachesThirtyPercent(lostCodes.length, previousCodes.size)
  ) {
    issues.push(issue({
      code: 'active_code_loss_threshold_exceeded',
      severity: 'error',
      count: lostCodes.length,
      sampleProductCodes: lostCodes,
    }));
  }

  for (const code of [
    'missing_name',
    'missing_barcode',
    'missing_price',
    'duplicate_barcode',
  ] as const) {
    const facts = input.facts.filter((fact) => fact.code === code);
    if (facts.length === 0) continue;
    issues.push(issue({
      code: warningIdentity(input.fileHash, code),
      severity: 'warning',
      count: facts.length,
      sampleRowNumbers: facts.map((fact) => fact.rowNumber),
      sampleProductCodes: facts.map((fact) => fact.productCode),
    }));
  }

  const churnCount = lostCodes.length + newCodes.length;
  if (
    previousCodes.size > 0
    && reachesTenPercent(churnCount, previousCodes.size)
    && !reachesThirtyPercent(churnCount, previousCodes.size)
  ) {
    issues.push(issue({
      code: warningIdentity(input.fileHash, 'snapshot_churn'),
      severity: 'warning',
      count: churnCount,
      sampleProductCodes: [...lostCodes, ...newCodes],
    }));
  }

  const inactiveReferences = [...new Set(input.confirmedReferencedProductCodes)]
    .filter((code) => !incomingCodes.has(code));
  if (inactiveReferences.length > 0) {
    issues.push(issue({
      code: warningIdentity(input.fileHash, 'inactive_recipe_reference'),
      severity: 'warning',
      count: inactiveReferences.length,
      sampleProductCodes: inactiveReferences,
    }));
  }

  return {
    blocked: issues.some((item) => item.severity === 'error'),
    report: { issues },
  };
}

function warningIdentity(fileHash: string, warningCode: string): string {
  return `${fileHash}:${warningCode}`;
}

function issue(input: {
  code: string;
  severity: 'warning' | 'error';
  count: number;
  sampleRowNumbers?: number[];
  sampleProductCodes?: string[];
}): SellpiaInventoryQualityIssue {
  return {
    code: input.code,
    severity: input.severity,
    count: input.count,
    sampleRowNumbers: unique(input.sampleRowNumbers ?? []).slice(0, SAMPLE_LIMIT),
    sampleProductCodes: unique(input.sampleProductCodes ?? [])
      .map((code) => code.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, SAMPLE_LIMIT),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function reachesTenPercent(count: number, total: number): boolean {
  return count * 10 >= total;
}

function reachesThirtyPercent(count: number, total: number): boolean {
  return count * 10 >= total * 3;
}
