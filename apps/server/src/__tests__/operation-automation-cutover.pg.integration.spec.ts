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
const ACTION_TASK_ID = '88888888-8888-4888-8888-888888888888';
const RULES_APPLICATION_ID = '99999999-9999-4999-8999-999999999999';

type CountedTable =
  | 'operation_runs'
  | 'operation_run_checkpoints'
  | 'operation_schedules'
  | 'workflow_runs'
  | 'workflow_templates'
  | 'marketplace'
  | 'action_tasks'
  | 'rules_evaluation_applications';

describe('operation/automation cutover migration over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let sourceImportRunId: string;
  // The KID-90 schema step drops these too. Where the pushed schema no longer
  // has one, the pre-cutover shape is recreated for this suite and removed after.
  const recreated = { actionTasks: false, rulesApplications: false, alertKind: false };

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
    recreated.actionTasks = !(await tableExists(prisma, 'action_tasks'));
    if (recreated.actionTasks) {
      await prisma.$executeRaw`
        CREATE TABLE action_tasks (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL,
          task_key text NOT NULL,
          label text NOT NULL,
          date date NOT NULL
        )
      `;
    }
    recreated.rulesApplications = !(await tableExists(prisma, 'rules_evaluation_applications'));
    if (recreated.rulesApplications) {
      await prisma.$executeRaw`
        CREATE TABLE rules_evaluation_applications (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL,
          request_id varchar(64) NOT NULL,
          product_count integer NOT NULL,
          violation_count integer NOT NULL,
          critical_count integer NOT NULL
        )
      `;
    }
    recreated.alertKind = !(await alertKindExists(prisma));
    if (recreated.alertKind) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN kind text NOT NULL DEFAULT 'signal'`;
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_run_checkpoints CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_runs CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS operation_schedules CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS workflow_runs CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS workflow_templates CASCADE`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS marketplace CASCADE`;
    if (recreated.actionTasks) await prisma.$executeRaw`DROP TABLE IF EXISTS action_tasks`;
    if (recreated.rulesApplications) {
      await prisma.$executeRaw`DROP TABLE IF EXISTS rules_evaluation_applications`;
    }
    if (recreated.alertKind) await prisma.$executeRaw`ALTER TABLE alerts DROP COLUMN IF EXISTS kind`;
    await prisma.$disconnect();
  });

  it('guards active writers, rolls back safely, and leaves alert cleanup to the narrow migration', async () => {
    await prisma.$executeRaw`
      INSERT INTO action_tasks (id, organization_id, task_key, label, date)
      VALUES (${ACTION_TASK_ID}::uuid, ${ORG}::uuid, 'cutover-sentinel', 'Action task sentinel', DATE '2026-09-07')
    `;
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
    const retiredAlert = await prisma.alert.create({
      data: {
        organizationId: ORG,
        dedupeKey: 'cutover-retired-alert-sentinel',
        type: 'source_failure',
        title: 'Retired cutover alert sentinel',
        status: 'OPEN',
      },
    });
    await prisma.$executeRaw`
      UPDATE alerts SET kind = 'operation'
      WHERE id = ${retiredAlert.id}::uuid AND organization_id = ${ORG}::uuid
    `;
    await prisma.$executeRaw`
      INSERT INTO rules_evaluation_applications
        (id, organization_id, request_id, product_count, violation_count, critical_count)
      VALUES (${RULES_APPLICATION_ID}::uuid, ${ORG}::uuid, 'cutover-rules-sentinel', 1, 1, 0)
    `;
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
    expect(await countRows(prisma, 'action_tasks')).toBe(1);

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
    expect(await countRows(prisma, 'rules_evaluation_applications')).toBe(1);
    expect(await countRows(prisma, 'action_tasks')).toBe(1);
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
        absentTables: [],
      },
    });
    expect(await countRows(prisma, 'operation_runs')).toBe(0);
    expect(await countRows(prisma, 'operation_run_checkpoints')).toBe(0);
    expect(await countRows(prisma, 'operation_schedules')).toBe(0);
    expect(await countRows(prisma, 'workflow_runs')).toBe(0);
    expect(await countRows(prisma, 'workflow_templates')).toBe(0);
    expect(await countRows(prisma, 'marketplace')).toBe(0);
    expect(await countRows(prisma, 'rules_evaluation_applications')).toBe(0);
    expect(await countAlertsOfKind(prisma, 'signal')).toBe(1);
    expect(await countAlertsOfKind(prisma, 'operation')).toBe(1);
    expect(await countRows(prisma, 'action_tasks')).toBe(1);
    expect(await prisma.sourceImportRun.count({ where: { id: sourceImportRunId, organizationId: ORG } })).toBe(1);

    await expect(
      prisma.$transaction((tx) => removeRetiredOperationAlerts.run(tx)),
    ).resolves.toEqual({
      affectedRows: 1,
      details: { retiredAlertRows: 1, removedAlertRows: 1, survivingRows: 1, kindColumnPresent: true },
    });
    expect(await countAlertsOfKind(prisma, 'signal')).toBe(1);
    expect(await countAlertsOfKind(prisma, 'operation')).toBe(0);

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
      details: { retiredAlertRows: 0, removedAlertRows: 0, survivingRows: 1, kindColumnPresent: true },
    });
  });

  it('changes nothing on a database the schema steps have already reshaped', async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.alert.create({
      data: {
        organizationId: ORG,
        dedupeKey: 'reshaped-alert-sentinel',
        type: 'source_failure',
        title: 'Current alert sentinel',
        status: 'OPEN',
      },
    });
    const restore = 'restore the pre-cutover shape';
    const results: { preparation?: unknown; alertCleanup?: unknown } = {};

    await expect(prisma.$transaction(async (tx) => {
      // What the v0.1.31 and KID-90 schema steps leave behind. The transaction
      // rolls back, so the suite's pre-cutover tables and column come back.
      await tx.$executeRaw`
        DROP TABLE operation_run_checkpoints, operation_runs, operation_schedules,
          workflow_runs, workflow_templates, marketplace,
          rules_evaluation_applications, action_tasks
      `;
      await tx.$executeRaw`ALTER TABLE alerts DROP COLUMN kind`;
      results.preparation = await prepareOperationAutomationCutover(tx);
      results.alertCleanup = await removeRetiredOperationAlerts.run(tx);
      throw new Error(restore);
    }, { timeout: 20_000 })).rejects.toThrow(restore);

    expect(results.preparation).toEqual({
      affectedRows: 0,
      details: {
        activeLedgerRows: 0,
        enabledScheduleRows: 0,
        ledgerRows: 0,
        checkpointRows: 0,
        scheduleRows: 0,
        workflowDefinitionRows: 0,
        workflowExecutionRows: 0,
        catalogRows: 0,
        deletedRulesApplicationRows: 0,
        deletedCheckpointRows: 0,
        deletedLedgerRows: 0,
        deletedScheduleRows: 0,
        deletedWorkflowExecutionRows: 0,
        deletedWorkflowDefinitionRows: 0,
        deletedCatalogRows: 0,
        dormantActionRows: 0,
        checkpointTablePresent: false,
        rulesApplicationsTablePresent: false,
        absentTables: [
          'operation_runs',
          'operation_run_checkpoints',
          'operation_schedules',
          'workflow_templates',
          'workflow_runs',
          'marketplace',
          'rules_evaluation_applications',
          'action_tasks',
        ],
      },
    });
    expect(results.alertCleanup).toEqual({
      affectedRows: 0,
      details: { retiredAlertRows: 0, removedAlertRows: 0, survivingRows: 1, kindColumnPresent: false },
    });
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(1);
  });
});

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ${table}
    ) AS present
  `;
  return row?.present === true;
}

async function alertKindExists(prisma: PrismaClient): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'alerts' AND column_name = 'kind'
    ) AS present
  `;
  return row?.present === true;
}

async function countAlertsOfKind(prisma: PrismaClient, kind: 'signal' | 'operation'): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM alerts
    WHERE organization_id = ${ORG}::uuid AND kind = ${kind}
  `;
  return Number(row?.count ?? 0n);
}

async function countRows(prisma: PrismaClient, table: CountedTable): Promise<number> {
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
    case 'action_tasks':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM action_tasks WHERE organization_id = ${ORG}::uuid`)[0]?.count ?? 0n);
    case 'rules_evaluation_applications':
      return Number((await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM rules_evaluation_applications WHERE organization_id = ${ORG}::uuid`)[0]?.count ?? 0n);
  }
}
