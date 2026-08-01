import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Operation Prisma schema contract', () => {
  it('persists run fencing and organization schedules', () => {
    const systemSchema = read('prisma/models/system.prisma');

    expect(systemSchema).toContain('model OperationRun {');
    expect(systemSchema).toContain('attemptToken');
    expect(systemSchema).toContain('leaseExpiresAt');
    expect(systemSchema).toContain('model OperationSchedule {');
    expect(systemSchema).toContain('cronExpression');
    expect(systemSchema).toContain('nextRunAt');
    expect(systemSchema).toContain(
      '@@unique([organizationId, operationKey, idempotencyKey]',
    );
  });

  it('adds organization and user back-relations', () => {
    const coreSchema = read('prisma/models/core.prisma');

    expect(coreSchema).toContain('operationRuns');
    expect(coreSchema).toContain('operationSchedules');
    expect(coreSchema).toContain('requestedOperationRuns');
    expect(coreSchema).toContain('createdOperationSchedules');
  });
});
