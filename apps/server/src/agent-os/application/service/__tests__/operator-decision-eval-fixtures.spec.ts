import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OperatorDecisionParser } from '../operator-decision-parser.service';

interface OperatorDecisionEvalFixture {
  name: string;
  rawOutput: string;
  expected: {
    decisionType: 'delegate' | 'ask_user' | 'refuse';
    targetAgentType?: 'sourcing' | 'order' | 'channel_registration';
    taskInputKeys?: string[];
  };
}

function fixtureDir(): string {
  return resolve(
    process.cwd(),
    '..',
    '..',
    'agent-config',
    'evals',
    'operator-decisions',
  );
}

function loadFixtures(): OperatorDecisionEvalFixture[] {
  const dir = fixtureDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const body = JSON.parse(
        readFileSync(resolve(dir, file), 'utf8'),
      ) as OperatorDecisionEvalFixture;
      return body;
    });
}

describe('OperatorDecision eval fixtures', () => {
  it('keeps representative replay outputs parseable by the KidItem contract', () => {
    const fixtures = loadFixtures();
    expect(fixtures.map((fixture) => fixture.name)).toEqual([
      'ask-user-for-missing-category',
      'delegate-coupang-listing-submission',
      'delegate-purchase-order-submission',
      'delegate-sourcing-market-opportunity',
      'refuse-external-purchase',
    ]);

    const parser = new OperatorDecisionParser();

    for (const fixture of fixtures) {
      const decision = parser.parse(fixture.rawOutput);

      expect(decision.decisionType).toBe(fixture.expected.decisionType);
      if (fixture.expected.targetAgentType) {
        expect(decision).toMatchObject({
          targetAgentType: fixture.expected.targetAgentType,
        });
      }
      if (
        decision.decisionType === 'delegate' &&
        fixture.expected.taskInputKeys
      ) {
        expect(Object.keys(decision.taskInput).sort()).toEqual(
          fixture.expected.taskInputKeys,
        );
      }
    }
  });
});
