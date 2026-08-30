import { describe, expect, it, vi } from 'vitest';
import { GatewayCapabilityApprovalEventAdapter } from './gateway-capability-approval-event.adapter';

describe('GatewayCapabilityApprovalEventAdapter', () => {
  it('publishes only the safe invocation locator under the exact active-turn owner fence', () => {
    const publishOwnedTurnEvent = vi.fn();
    const adapter = new GatewayCapabilityApprovalEventAdapter({ publishOwnedTurnEvent } as never);

    adapter.publish({
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      invocationId: '00000000-0000-4000-8000-000000000003',
    });

    expect(publishOwnedTurnEvent).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    }, {
      kind: 'capability.approval_required',
      invocationId: '00000000-0000-4000-8000-000000000003',
    });
  });
});
