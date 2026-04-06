import { z } from 'zod';

// 광고 전략 에이전트 결과
export const AdStrategyOutputSchema = z.object({
  task_id: z.string().optional(),
  dry_run: z.boolean().optional(),
  actions: z.array(z.object({
    product_id: z.string(),
    product_name: z.string().optional(),
    action: z.enum(['stop_ad', 'increase_budget', 'decrease_budget', 'minimize_budget']),
    reason: z.string(),
  })),
  // 등급별 규칙 추천 (getRules 대체)
  recommendations: z.array(z.object({
    productId: z.string().optional(),
    name: z.string(),
    grade: z.string(),
    rule: z.string(),
    action: z.string(),
    priority: z.enum(['urgent', 'high', 'medium', 'low']),
    roas: z.number().optional(),
    spend: z.number().optional(),
  })).optional(),

  // AI 추천 카드 (getRecommendations 대체)
  cards: z.array(z.object({
    title: z.string(),
    icon: z.string(),
    color: z.string(),
    items: z.array(z.object({
      text: z.string(),
      productName: z.string().optional(),
      value: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low']),
    })),
  })).optional(),

  // 주간 플랜 요약 (getWeeklyPlan 대체)
  plan: z.object({
    summary: z.object({
      scaleUp: z.number(),
      optimize: z.number(),
      reduce: z.number(),
      stop: z.number(),
      newStart: z.number(),
    }),
    keyMetrics: z.object({
      totalAdSpend: z.number(),
      totalAdRevenue: z.number(),
      overallRoas: z.number(),
    }),
  }).optional(),

  summary: z.object({
    total: z.number(),
    stop: z.number().optional(),
    increase: z.number().optional(),
    decrease: z.number().optional(),
  }),
});

// 건강도 평가 에이전트 결과
export const RulesEvaluationOutputSchema = z.object({
  products: z.array(z.object({
    productId: z.string(),
    healthScore: z.number().min(0).max(100),
    violations: z.array(z.object({
      ruleName: z.string(),
      field: z.string(),
      severity: z.enum(['critical', 'warning', 'info']),
      category: z.string(),
      message: z.string(),
      actionType: z.string().optional(),
      value: z.union([z.number(), z.string()]).optional(),
    })),
  })),
  summary: z.object({
    total: z.number(),
    healthy: z.number().optional(),
    warning: z.number().optional(),
    critical: z.number().optional(),
    violationCount: z.number().optional(),
  }),
});

// 규칙 임계값 추천 에이전트 결과
export const RulesSuggestOutputSchema = z.object({
  distributions: z.record(z.unknown()),
  suggestions: z.array(z.object({
    ruleName: z.string().optional(),
    field: z.string().optional(),
    currentThreshold: z.union([z.number(), z.string()]).optional(),
    suggestedThreshold: z.union([z.number(), z.string()]).optional(),
    reason: z.string().optional(),
  })),
});

// 매니저 에이전트 결과
export const ManagerOutputSchema = z.object({
  analysis: z.string(),
  recommended_agents: z.array(z.string()),
  priority: z.string().optional(),
});

// type -> schema 매핑
export const AGENT_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  ad_strategy: AdStrategyOutputSchema,
  rules_evaluation: RulesEvaluationOutputSchema,
  rules_suggest: RulesSuggestOutputSchema,
  manager: ManagerOutputSchema,
};
