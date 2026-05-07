import { describe, expect, it } from 'vitest';
import {
  agentInstanceLifecycleStatusSchema,
  agentRunRequestStatusSchema,
  agentRunStatusSchema,
  agentToolPolicyEffectSchema,
  createAgentRunRequestSchema,
} from './agent-os';

describe('agent-os schemas', () => {
  it('defaults taskKey to default at the API boundary', () => {
    const parsed = createAgentRunRequestSchema.parse({
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
      createAgentRunRequestSchema.parse({ agentType: '', sourceType: 'manual' }),
    ).toThrow();
  });

  it('does not allow queued as a run status', () => {
    expect(() => agentRunStatusSchema.parse('queued')).toThrow();
    expect(agentRunStatusSchema.parse('running')).toBe('running');
  });

  it('keeps queue status names on AgentRunRequest', () => {
    expect(agentRunRequestStatusSchema.parse('pending')).toBe('pending');
    expect(agentRunRequestStatusSchema.parse('claimed')).toBe('claimed');
    expect(agentRunRequestStatusSchema.parse('coalesced')).toBe('coalesced');
    expect(agentRunRequestStatusSchema.parse('requires_approval')).toBe(
      'requires_approval',
    );
    expect(() => agentRunRequestStatusSchema.parse('running')).toThrow();
  });

  it('accepts the three lifecycle states', () => {
    expect(agentInstanceLifecycleStatusSchema.parse('active')).toBe('active');
    expect(agentInstanceLifecycleStatusSchema.parse('paused')).toBe('paused');
    expect(agentInstanceLifecycleStatusSchema.parse('disabled')).toBe(
      'disabled',
    );
    expect(() => agentInstanceLifecycleStatusSchema.parse('idle')).toThrow();
  });

  it('captures three tool policy effects', () => {
    expect(agentToolPolicyEffectSchema.parse('allow')).toBe('allow');
    expect(agentToolPolicyEffectSchema.parse('deny')).toBe('deny');
    expect(agentToolPolicyEffectSchema.parse('approval_required')).toBe(
      'approval_required',
    );
  });
});
