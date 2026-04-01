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
  answer: z.string(),
  data: z.record(z.unknown()).optional(),
  recommendations: z.array(z.object({
    action: z.string(),
    target: z.string().optional(),
    reason: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
  })).optional(),
});

// type -> schema 매핑
export const AGENT_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  ad_strategy: AdStrategyOutputSchema,
  rules_evaluation: RulesEvaluationOutputSchema,
  rules_suggest: RulesSuggestOutputSchema,
  manager: ManagerOutputSchema,
};
