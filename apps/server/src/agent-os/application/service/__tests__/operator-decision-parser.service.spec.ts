import { describe, expect, it } from 'vitest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { OperatorDecisionParser } from '../operator-decision-parser.service';

describe('OperatorDecisionParser', () => {
  const parser = new OperatorDecisionParser();

  it('parses a strict delegate JSON decision', () => {
    const decision = parser.parse(`{
      "decisionType": "delegate",
      "targetAgentType": "sourcing",
      "playbookKey": "sourcing_market_opportunity_to_order_draft_v1",
      "taskInput": { "keyword": "실리콘 식판" },
      "userVisibleRationale": "소싱 에이전트가 시장 신호를 확인해야 합니다."
    }`);

    expect(decision).toEqual({
      decisionType: 'delegate',
      targetAgentType: 'sourcing',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      taskInput: { keyword: '실리콘 식판' },
      userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
    });
  });

  it('normalizes nullable schema-shaped delegate decisions before strict validation', () => {
    const decision = parser.parse(`{
      "decisionType": "delegate",
      "targetAgentType": "sourcing",
      "playbookKey": "sourcing_market_opportunity_to_order_draft_v1",
      "taskInput": {
        "keyword": "실리콘 식판",
        "category": null,
        "objective": "테스트 발주 후보 소싱",
        "minMarginRate": 0.25
      },
      "userVisibleRationale": "소싱 에이전트가 시장 신호를 확인해야 합니다.",
      "question": null,
      "reason": null
    }`);

    expect(decision).toEqual({
      decisionType: 'delegate',
      targetAgentType: 'sourcing',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      taskInput: {
        keyword: '실리콘 식판',
        objective: '테스트 발주 후보 소싱',
        minMarginRate: 0.25,
      },
      userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
    });
  });

  it('rejects markdown-wrapped decisions', () => {
    expect(() =>
      parser.parse(`\`\`\`json
{
  "decisionType": "refuse",
  "reason": "승인 없는 외부 주문은 실행할 수 없습니다."
}
\`\`\``),
    ).toThrowError(
      new AgentOsRuntimeError(
        'operator_decision_invalid_json',
        'Operator decision must be one strict JSON object.',
      ),
    );
  });

  it('rejects multiple JSON objects', () => {
    expect(() =>
      parser.parse(`{"decisionType":"refuse","reason":"첫 번째"}
{"decisionType":"refuse","reason":"두 번째"}`),
    ).toThrowError(
      new AgentOsRuntimeError(
        'operator_decision_multiple_json',
        'Operator decision output must contain exactly one JSON object.',
      ),
    );
  });

  it('rejects schema-invalid JSON', () => {
    expect(() =>
      parser.parse(`{
        "decisionType": "delegate",
        "targetAgentType": "inventory",
        "playbookKey": "sourcing_market_opportunity_to_order_draft_v1",
        "taskInput": { "keyword": "실리콘 식판" },
        "userVisibleRationale": "재고 에이전트에게 넘깁니다."
      }`),
    ).toThrowError(AgentOsRuntimeError);
  });
});
