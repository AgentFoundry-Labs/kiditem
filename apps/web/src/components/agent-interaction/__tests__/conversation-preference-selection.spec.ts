import { describe, expect, it } from 'vitest';
import { selectTurnPreference } from '../conversation-preference-selection';

const readiness = [{
  runtime: 'codex_cli' as const,
  ready: true as const,
  readiness: {
    runtime: 'codex_cli' as const,
    version: '0.149.1',
    models: ['gpt-5.6', 'gpt-5.6-mini'],
    reasoningEfforts: ['low', 'high'],
    modelReasoningEfforts: [
      { model: 'gpt-5.6', reasoningEfforts: ['low'] },
      { model: 'gpt-5.6-mini', reasoningEfforts: ['high'] },
    ],
    loginVerified: true as const,
    mcpProtocolRevision: '2026-07-28',
  },
}];

describe('selectTurnPreference', () => {
  it('uses only a supported matching preference pair for a new draft', () => {
    expect(selectTurnPreference({
      conversation: null,
      draftContext: 'sourcing',
      runtime: 'codex_cli',
      readiness,
      preferences: {
        schemaVersion: 1,
        contexts: {
          sourcing: { codex_cli: { model: 'gpt-5.6-mini', reasoningEffort: 'high' } },
        },
      },
    })).toEqual({ model: 'gpt-5.6-mini', reasoningEffort: 'high', needsReview: false });
  });

  it('keeps a fresh draft neutral and surfaces only an actually stored unsupported pair for review', () => {
    expect(selectTurnPreference({
      conversation: null,
      draftContext: null,
      runtime: 'codex_cli',
      readiness,
      preferences: {
        schemaVersion: 1,
        contexts: { general: { codex_cli: { model: 'retired-model', reasoningEffort: 'max' } } },
      },
    })).toEqual({ model: 'retired-model', reasoningEffort: 'max', needsReview: true });

    expect(selectTurnPreference({
      conversation: null,
      draftContext: null,
      runtime: 'codex_cli',
      readiness,
      preferences: undefined,
    })).toEqual({ model: null, reasoningEffort: null, needsReview: false });

    expect(selectTurnPreference({
      conversation: null,
      draftContext: null,
      runtime: 'codex_cli',
      readiness: undefined,
      preferences: { schemaVersion: 1, contexts: {} },
    })).toEqual({ model: null, reasoningEffort: null, needsReview: false });
  });

  it('keeps a supported existing turn pair ahead of a preference and otherwise uses a supported matching preference', () => {
    const conversation = {
      id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const,
      title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
      lastModel: 'gpt-5.6', lastReasoningEffort: 'low',
    };
    const preferences = {
      schemaVersion: 1 as const,
      contexts: { sourcing: { codex_cli: { model: 'gpt-5.6-mini', reasoningEffort: 'high' } } },
    };

    expect(selectTurnPreference({
      conversation,
      draftContext: null,
      runtime: 'codex_cli',
      readiness,
      preferences,
    })).toEqual({ model: 'gpt-5.6', reasoningEffort: 'low', needsReview: false });

    expect(selectTurnPreference({
      conversation: { ...conversation, lastModel: 'retired-model', lastReasoningEffort: 'max' },
      draftContext: null,
      runtime: 'codex_cli',
      readiness,
      preferences,
    })).toEqual({ model: 'gpt-5.6-mini', reasoningEffort: 'high', needsReview: false });
  });
});
