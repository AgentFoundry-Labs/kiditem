import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = process.cwd().endsWith('/apps/server')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/server');

describe('Rocket purchase boundary', () => {
  it('keeps preview and durable workbook export canonical without a direct stock-matching action', () => {
    const sourcePaths = [
      'src/supply/adapter/in/http/dto/purchase-order-action.dto.ts',
      'src/supply/adapter/in/http/procurement.controller.ts',
      'src/channels/application/port/in/rocket-po-catalog.port.ts',
      'src/channels/application/service/rocket-po-catalog.service.ts',
    ];
    const sources = sourcePaths
      .map((path) => readFileSync(resolve(serverRoot, path), 'utf8'))
      .join('\n');

    expect(sources).not.toMatch(
      /matchRocketStock|matchSavedStock|RocketStockMatchRow/,
    );
    expect(sources).toContain("body.action === 'previewRocket'");
    expect(sources).toContain("body.action === 'exportRocketWorkbook'");
    expect(sources).toContain("body.action === 'getActiveRocketWorkbook'");
    expect(sources).toContain("body.action === 'downloadRocketWorkbook'");
    expect(sources).toContain("body.action === 'abandonRocketWorkbook'");
    expect(sources).not.toMatch(/confirmRocket|releaseRocketConfirmation/);
  });
});
