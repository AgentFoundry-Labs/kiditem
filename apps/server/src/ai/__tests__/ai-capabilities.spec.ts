import { describe, expect, it } from 'vitest';
import { AI_CAPABILITIES } from '../domain/capability/ai.capabilities';

describe('AI capability manifest', () => {
  it('does not publish marketplace submission; Channels owns Wing submission', () => {
    expect(AI_CAPABILITIES).toEqual([]);
  });
});
