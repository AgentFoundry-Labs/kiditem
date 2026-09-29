import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * KID-388: 로켓 워크북 진행은 이제 Orders 셀피아 전송 실행(`orders.sellpia_order_transfer`)으로 판정하고, 옛 전송 intent
 * 표 두 개(`sellpia_order_transmission_intents`·`…_reconciliations`)는 이 트레인의 스키마 단계에서 사라진다. 옛 판정으로
 * 이미 끝났지만 아직 읽히지 않아 `completed_at`이 비어 있는 워크북은 새 판정에서 다시 열리므로, 표가 남아 있는
 * pre-schema에서 그 사실을 워크북에 옮긴다.
 *
 * 옛 판정 그대로: 열린 워크북(`completed_at`·`released_at` 없음)의 양수 라인이 모두 수집됐고, 비어 있지 않은 관측
 * (`intent_key` 있음)이 하나 이상이며 그 intent가 모두 `finalized`면 가장 늦은 `finalized_at`을 찍는다. 이미 찍힌
 * 워크북은 그대로 둔다 — 다시 돌면 바꿀 것이 없다. intent 표가 없으면(스키마 단계 뒤, 새 DB) 건너뛴다.
 */
export const stampRocketWorkbookCompletedFromTransmissionIntentsMigration: DataMigration = {
  id: 'v0.1.31:035_stamp_rocket_workbook_completed_from_transmission_intents',
  releaseVersion: '0.1.31',
  name: 'Stamp Rocket workbook completion proven only by finalized Sellpia transmission intents',
  phase: 'pre-schema',
  async run(tx: Prisma.TransactionClient): Promise<MigrationResult> {
    const [shape] = await tx.$queryRaw<Array<{ intents: boolean }>>`
      SELECT to_regclass('public.sellpia_order_transmission_intents') IS NOT NULL AS intents
    `;
    if (!shape?.intents) return { affectedRows: 0, details: { outcome: 'intent_table_absent' } };

    // queryraw-tenancy-exempt: 컷오버 이전 — 모든 조직의 열린 워크북을 같은 조직의 intent로만 판정한다.
    const stampedWorkbooks = await tx.$executeRaw`
      WITH proven AS (
        SELECT transmission.confirmation_id, MAX(intent.finalized_at) AS completed_at
        FROM rocket_purchase_confirmation_transmissions transmission
        LEFT JOIN sellpia_order_transmission_intents intent
          ON intent.organization_id = transmission.organization_id
         AND intent.intent_key = transmission.intent_key
        WHERE transmission.intent_key IS NOT NULL
        GROUP BY transmission.confirmation_id
        HAVING bool_and(intent.status = 'finalized' AND intent.finalized_at IS NOT NULL)
      )
      UPDATE rocket_purchase_confirmations confirmation
      SET completed_at = proven.completed_at
      FROM proven
      WHERE confirmation.id = proven.confirmation_id
        AND confirmation.completed_at IS NULL
        AND confirmation.released_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM rocket_purchase_confirmation_lines line
          WHERE line.confirmation_id = confirmation.id
            AND line.organization_id = confirmation.organization_id
            AND line.confirmed_quantity > 0
            AND line.collected_at IS NULL
        )
    `;
    return { affectedRows: stampedWorkbooks, details: { outcome: 'stamped', stampedWorkbooks } };
  },
};
