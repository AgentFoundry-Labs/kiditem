import type { DataMigration } from '../types';

export const classifyAgentOsInstances: DataMigration = {
  id: 'v0.1.7:003_classify_agent_os_instances',
  releaseVersion: '0.1.7',
  name: 'Classify Agent OS instances as employees or capabilities',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      UPDATE agent_instances
      SET role = CASE
            WHEN type = 'manager' THEN 'employee'
            WHEN type = 'sourcing' THEN 'employee'
            WHEN type = 'listing' THEN 'employee'
            WHEN type = 'order' THEN 'employee'
            WHEN type = 'channel_registration' THEN 'employee'
            WHEN type = 'ad_strategy' THEN 'employee'
            WHEN type = 'chat' THEN 'employee'
            WHEN type = 'rules_evaluation' THEN 'capability'
            WHEN type = 'rules_suggest' THEN 'capability'
            WHEN type = 'thumbnail_analyst' THEN 'capability'
            ELSE role
          END,
          title = CASE
            WHEN type = 'manager' THEN '운영 총괄'
            WHEN type = 'sourcing' THEN '소싱 담당'
            WHEN type = 'listing' THEN '상품 등록 담당'
            WHEN type = 'order' THEN '발주 담당'
            WHEN type = 'channel_registration' THEN '채널 등록 담당'
            WHEN type = 'ad_strategy' THEN '광고 전략 담당'
            WHEN type = 'chat' THEN '고객/운영 응대 담당'
            WHEN type = 'rules_evaluation' THEN '룰 평가 능력'
            WHEN type = 'rules_suggest' THEN '임계값 제안 능력'
            WHEN type = 'thumbnail_analyst' THEN '썸네일 분석 능력'
            ELSE title
          END,
          updated_at = NOW()
      WHERE type IN (
        'manager',
        'sourcing',
        'listing',
        'order',
        'channel_registration',
        'ad_strategy',
        'chat',
        'rules_evaluation',
        'rules_suggest',
        'thumbnail_analyst'
      )
      AND (
        role IS DISTINCT FROM CASE
          WHEN type IN (
            'manager',
            'sourcing',
            'listing',
            'order',
            'channel_registration',
            'ad_strategy',
            'chat'
          ) THEN 'employee'
          ELSE 'capability'
        END
        OR title IS DISTINCT FROM CASE
          WHEN type = 'manager' THEN '운영 총괄'
          WHEN type = 'sourcing' THEN '소싱 담당'
          WHEN type = 'listing' THEN '상품 등록 담당'
          WHEN type = 'order' THEN '발주 담당'
          WHEN type = 'channel_registration' THEN '채널 등록 담당'
          WHEN type = 'ad_strategy' THEN '광고 전략 담당'
          WHEN type = 'chat' THEN '고객/운영 응대 담당'
          WHEN type = 'rules_evaluation' THEN '룰 평가 능력'
          WHEN type = 'rules_suggest' THEN '임계값 제안 능력'
          WHEN type = 'thumbnail_analyst' THEN '썸네일 분석 능력'
          ELSE title
        END
      )
    `;

    return {
      affectedRows,
      details: {
        classifiedRoles: {
          employee: [
            'manager',
            'sourcing',
            'listing',
            'order',
            'channel_registration',
            'ad_strategy',
            'chat',
          ],
          capability: ['rules_evaluation', 'rules_suggest', 'thumbnail_analyst'],
        },
      },
    };
  },
};
