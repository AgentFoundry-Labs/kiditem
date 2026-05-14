import { describe, expect, it } from 'vitest';
import {
  AgentInstanceLifecycleStatusSchema,
  AgentRunRequestStatusSchema,
  AgentRunStatusSchema,
  AgentToolPolicyEffectSchema,
  CreateAgentRunRequestSchema,
} from './agent-os';

describe('agent-os schemas', () => {
  it('defaults taskKey to default at the API boundary', () => {
    const parsed = CreateAgentRunRequestSchema.parse({
      agentType: 'listing-writer',
      sourceType: 'manual',
    });

    expect(parsed.taskKey).toBe('default');
    expect(parsed.priority).toBe(0);
    expect(parsed.payload).toEqual({});
    expect(parsed.dryRun).toBe(false);
  });

  it('rejects empty agent type', () => {
    expect(() =>
      CreateAgentRunRequestSchema.parse({ agentType: '', sourceType: 'manual' }),
    ).toThrow();
  });

  it('does not allow queued as a run status', () => {
    expect(() => AgentRunStatusSchema.parse('queued')).toThrow();
    expect(AgentRunStatusSchema.parse('running')).toBe('running');
  });

  it('keeps queue status names on AgentRunRequest', () => {
    expect(AgentRunRequestStatusSchema.parse('pending')).toBe('pending');
    expect(AgentRunRequestStatusSchema.parse('claimed')).toBe('claimed');
    expect(AgentRunRequestStatusSchema.parse('coalesced')).toBe('coalesced');
    expect(AgentRunRequestStatusSchema.parse('requires_approval')).toBe(
      'requires_approval',
    );
    expect(() => AgentRunRequestStatusSchema.parse('running')).toThrow();
  });

  it('accepts the three lifecycle states', () => {
    expect(AgentInstanceLifecycleStatusSchema.parse('active')).toBe('active');
    expect(AgentInstanceLifecycleStatusSchema.parse('paused')).toBe('paused');
    expect(AgentInstanceLifecycleStatusSchema.parse('disabled')).toBe(
      'disabled',
    );
    expect(() => AgentInstanceLifecycleStatusSchema.parse('idle')).toThrow();
  });

  it('captures three tool policy effects', () => {
    expect(AgentToolPolicyEffectSchema.parse('allow')).toBe('allow');
    expect(AgentToolPolicyEffectSchema.parse('deny')).toBe('deny');
    expect(AgentToolPolicyEffectSchema.parse('approval_required')).toBe(
      'approval_required',
    );
  });
});
