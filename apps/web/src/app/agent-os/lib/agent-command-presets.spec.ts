import { describe, expect, it } from 'vitest';
import {
  buildOperatorCommand,
  getAgentCommandPresets,
} from './agent-command-presets';

describe('agent command presets', () => {
  it('adds an explicit delegation hint when a non-manager employee is selected', () => {
    expect(
      buildOperatorCommand({
        content: '신규 상품 후보를 정리해줘',
        target: {
          agentType: 'sourcing',
          displayName: '소싱 담당',
        },
      }),
    ).toBe(
      [
        '[Agent OS 업무 배정 요청]',
        '대상 직원: 소싱 담당',
        '대상 직원 유형: sourcing',
        '업무: 신규 상품 후보를 정리해줘',
      ].join('\n'),
    );
  });

  it('keeps manager commands unchanged because Operator is already the entrypoint', () => {
    expect(
      buildOperatorCommand({
        content: ' 승인 대기 업무를 정리해줘 ',
        target: {
          agentType: 'manager',
          displayName: '운영 총괄',
        },
      }),
    ).toBe('승인 대기 업무를 정리해줘');
  });

  it('keeps a blank command blank even when an employee is selected', () => {
    expect(
      buildOperatorCommand({
        content: '   ',
        target: {
          agentType: 'sourcing',
          displayName: '소싱 담당',
        },
      }),
    ).toBe('');
  });

  it('returns employee-specific quick commands with a manager fallback', () => {
    expect(getAgentCommandPresets('sourcing')).toContain(
      '신규 상품 후보와 공급처 리스크를 정리해줘',
    );
    expect(getAgentCommandPresets('unknown')).toEqual(
      getAgentCommandPresets('manager'),
    );
  });
});
