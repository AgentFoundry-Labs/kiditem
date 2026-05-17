import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SERVER_SRC = 'apps/server/src';

function rg(args: string): string[] {
  try {
    return execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe('operation alert consumer boundary', () => {
  it('cross-owner producers do not import OperationAlertService directly', () => {
    const hits = rg(
      `--type ts -n "automation/application/service/operation-alert.service" ${SERVER_SRC} --glob '!apps/server/src/automation/**' --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      [
        'Cross-owner producers must use automation OPERATION_ALERT_PORT through',
        'their local adapter/out/automation seam instead of injecting',
        'OperationAlertService concretely.',
      ].join(' '),
    ).toEqual([]);
  });

  it('owner-side OPERATION_ALERT_PORT is consumed only through adapters or platform orchestrators', () => {
    const hits = rg(
      `--type ts -n "automation/application/port/in/operation-alert.port" ${SERVER_SRC} --glob '!apps/server/src/automation/**' --glob '!**/__tests__/**'`,
    );

    const allowedPrefixes = [
      'apps/server/src/advertising/adapter/out/automation/',
      'apps/server/src/ai/adapter/out/automation/',
      'apps/server/src/analytics/traffic/adapter/out/automation/',
      'apps/server/src/channels/adapter/out/automation/',
      'apps/server/src/finance/adapter/out/automation/',
      'apps/server/src/rules/adapter/out/automation/',
      'apps/server/src/sourcing/adapter/out/automation/',
      'apps/server/src/operation-cancellation/',
    ];
    const violators = hits.filter((line) => {
      const file = line.split(':', 1)[0] ?? '';
      return !allowedPrefixes.some((prefix) => file.startsWith(prefix));
    });

    expect(
      violators,
      [
        'Owner-side OPERATION_ALERT_PORT belongs at cross-owner adapter seams',
        'or platform orchestrators; application services should depend on',
        'their local operation-alert port.',
      ].join(' '),
    ).toEqual([]);
  });
});
