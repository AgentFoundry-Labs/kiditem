import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../test-helpers/real-prisma';
import { prepareOperationAutomationCutover } from '../../../../scripts/data-migrations/v0.1.31/003_prepare_operation_automation_cutover';
import { removeRetiredOperationAlerts } from '../../../../scripts/data-migrations/v0.1.31/005_remove_retired_operation_alerts';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const CHECKPOINT_ID = '33333333-3333-4333-8333-333333333333';
const SCHEDULE_ID = '44444444-4444-4444-8444-444444444444';
const TEMPLATE_ID = '55555555-5555-4555-8555-555555555555';
const WORKFLOW_ID = '66666666-6666-4666-8666-666666666666';
const MARKETPLACE_ID = '77777777-7777-4777-8777-777777777777';

describe('operation/automation cutover migration over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let actionTaskId: string;
  let sourceImportRunId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.$executeRaw`
      CREATE TABLE operation_runs (
        id uuid PRIMARY KEY,
        status text NOT NULL
      )
    `;
    await prisma.$executeRaw`
      CREATE TABLE operation_run_checkpoints (
        id uuid PRIMARY KEY,
        operation_run_id uuid NOT NULL REFERENCES operation_runs(id) ON DELETE RESTRICT
      )
    `;
    await prisma.$executeRaw`
      CREATE TABLE operation_schedules (
        id uuid PRIMARY KEY,
        enabled boolean NOT NULL
      )
    `;
    await prisma.$executeRaw`
      CREATE TABLE workflow_templates (
        id uuid PRIMARY KEY
      )
    `;
    await prisma.$executeRaw`
      CREATE TABLE workflow_runs (
        id uuid PRIMARY KEY,
        workflow_template_id uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE RESTRICT
      )
    `;
    await prisma.$executeRaw`
      CREATE TABLE marketplace (
        id uuid PRIMARY KEY
      )
    `;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_run_checkpoints CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_runs CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_schedules CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS workflow_runs CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS workflow_templates CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS marketplace CASCADE`;
    await prisma.$disconnect();
  });

  it('guards active writers, rolls back safely, and leaves alert cleanup to the narrow migration', async () => {
    const actionTask = await prisma.actionTask.create({
      data: {
        organizationId: ORG,
        taskKey: 'cutover-sentinel',
        label: 'Dormant task sentinel',
        date: new Date('2026-09-07T00:00:00.000Z'),
      },
    });
    actionTaskId = actionTask.id;
    const sourceImportRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'cutover-sentinel',
        status: 'completed',
      },
    });
    sourceImportRunId = sourceImportRun.id;
    await prisma.alert.create({
      data: {
        organizationId: ORG,
        dedupeKey: 'cutover-alert-sentinel',
        type: 'source_failure',
        title: 'Cutover alert sentinel',
        status: 'OPEN',
      },
    });
    await prisma.alert.create({
      data: {
        organizationId: ORG,
        dedupeKey: 'cutover-retired-alert-sentinel',
        kind: 'operation',
        type: 'source_failure',
        title: 'Retired cutover alert sentinel',
        status: 'OPEN',
      },
    });
    await prisma.rulesEvaluationApplication.create({
      data: {
        organizationId: ORG,
        requestId: 'cutover-rules-sentinel',
        productCount: 1,
        violationCount: 1,
        criticalCount: 0,
      },
    });
    await prisma.$executeRaw`
      INSERT INTO operation_runs (id, status)
      VALUES (${OPERATION_ID}::uuid, 'completed'), (${ACTIVE_OPERATION_ID}::uuid, 'running')
    `;
    await prisma.$executeRaw`
      INSERT INTO operation_run_checkpoints (id, operation_run_id)
      VALUES (${CHECKPOINT_ID}::uuid, ${OPERATION_ID}::uuid)
    `;
    await prisma.$executeRaw`
      INSERT INTO operation_schedules (id, enabled)
      VALUES (${SCHEDULE_ID}::uuid, false)
    `;
    await prisma.$executeRaw`
      INSERT INTO workflow_templates (id) VALUES (${TEMPLATE_ID}::uuid)
    `;
    await prisma.$executeRaw`
      INSERT INTO workflow_runs (id, workflow_template_id)
      VALUES (${WORKFLOW_ID}::uuid, ${TEMPLATE_ID}::uuid)
    `;
    await prisma.$executeRaw`
      INSERT INTO marketplace (id) VALUES (${MARKETPLACE_ID}::uuid)
    `;

    await expect(
      prisma.$transaction((tx) => prepareOperationAutomationCutover(tx)),
    ).rejects.toThrow(/active ledger rows remain/i);
    expect(await countRows(prisma, 'operation_runs')).toBe(2);
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(2);
    expect(await prisma.actionTask.count({ where: { id: actionTaskId, organizationId: ORG } })).toBe(1);

    await prisma.$executeRaw`
      UPDATE operation_runs SET status = 'completed'
      WHERE id = ${ACTIVE_OPERATION_ID}::uuid
    `;
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION cutover_test_block_marketplace_delete()
      RETURNS trigger LANGUAGE plpgsql AS $cutover$
      BEGIN
        RAISE EXCEPTION 'cutover rollback sentinel';
      END;
      $cutover$
    `;
    await prisma.$executeRaw`
      CREATE TRIGGER cutover_test_block_marketplace_delete
      BEFORE DELETE ON marketplace
      FOR EACH ROW EXECUTE FUNCTION cutover_test_block_marketplace_delete();
    `;

    await expect(
      prisma.$transaction((tx) => prepareOperationAutomationCutover(tx)),
    ).rejects.toThrow('cutover rollback sentinel');
    expect(await countRows(prisma, 'operation_runs')).toBe(2);
    expect(await countRows(prisma, 'operation_run_checkpoints')).toBe(1);
    expect(await countRows(prisma, 'workflow_runs')).toBe(1);
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(2);
    expect(await prisma.rulesEvaluationApplication.count({ where: { organizationId: ORG } })).toBe(1);
    expect(await prisma.actionTask.count({ where: { id: actionTaskId, organizationId: ORG } })).toBe(1);
    expect(await prisma.sourceImportRun.count({ where: { id: sourceImportRunId, organizationId: ORG } })).toBe(1);

    await prisma.$executeRaw`DROP TRIGGER cutover_test_block_marketplace_delete ON marketplace`;
    await prisma.$executeRaw`DROP FUNCTION cutover_test_block_marketplace_delete()`;

    await expect(
      prisma.$transaction((tx) => prepareOperationAutomationCutover(tx)),
    ).resolves.toMatchObject({
      affectedRows: 8,
      details: {
        ledgerRows: 2,
        checkpointRows: 1,
        scheduleRows: 1,
        workflowDefinitionRows: 1,
        workflowExecutionRows: 1,
        catalogRows: 1,
        dormantActionRows: 1,
      },
    });
    expect(await countRows(prisma, 'operation_runs')).toBe(0);
    expect(await countRows(prisma, 'operation_run_checkpoints')).toBe(0);
    expect(await countRows(prisma, 'operation_schedules')).toBe(0);
    expect(await countRows(prisma, 'workflow_runs')).toBe(0);
    expect(await countRows(prisma, 'workflow_templates')).toBe(0);
    expect(await countRows(prisma, 'marketplace')).toBe(0);
    expect(await prisma.alert.count({ where: { organizationId: ORG, kind: 'signal' } })).toBe(1);
    expect(await prisma.alert.count({ where: { organizationId: ORG, kind: 'operation' } })).toBe(1);
    expect(await prisma.actionTask.count({ where: { id: actionTaskId, organizationId: ORG } })).toBe(1);
    expect(await prisma.sourceImportRun.count({ where: { id: sourceImportRunId, organizationId: ORG } })).toBe(1);

    await expect(
      prisma.$transaction((tx) => removeRetiredOperationAlerts.run(tx)),
    ).resolves.toEqual({
      affectedRows: 1,
      details: { retiredAlertRows: 1, removedAlertRows: 1, survivingRows: 1 },
    });
    expect(await prisma.alert.count({ where: { organizationId: ORG, kind: 'signal' } })).toBe(1);
    expect(await prisma.alert.count({ where: { organizationId: ORG, kind: 'operation' } })).toBe(0);

    await expect(
      prisma.$transaction((tx) => prepareOperationAutomationCutover(tx)),
    ).resolves.toMatchObject({
      affectedRows: 0,
      details: { dormantActionRows: 1 },
    });
    await expect(
      prisma.$transaction((tx) => removeRetiredOperationAlerts.run(tx)),
    ).resolves.toEqual({
      affectedRows: 0,
      details: { retiredAlertRows: 0, removedAlertRows: 0, survivingRows: 1 },
    });
  });
});

async function countRows(
  prisma: PrismaClient,
  table: 'operation_runs' | 'operation_run_checkpoints' | 'operation_schedules' | 'workflow_runs' | 'workflow_templates' | 'marketplace',
): Promise<number> {
  switch (table) {
    case 'operation_runs':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM operation_runs`)[0]?.count ?? 0n);
    case 'operation_run_checkpoints':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM operation_run_checkpoints`)[0]?.count ?? 0n);
    case 'operation_schedules':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM operation_schedules`)[0]?.count ?? 0n);
    case 'workflow_runs':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM workflow_runs`)[0]?.count ?? 0n);
    case 'workflow_templates':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM workflow_templates`)[0]?.count ?? 0n);
    case 'marketplace':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM marketplace`)[0]?.count ?? 0n);
  }
}
