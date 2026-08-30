import type {
  CapabilityApprovalEventInput,
  CapabilityApprovalEventPort,
} from '../../../../application/port/out/event/capability-approval-event.port';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';

/** Bridges a Nest-owned durable approval into the already-live CopilotKit turn. */
export class GatewayCapabilityApprovalEventAdapter implements CapabilityApprovalEventPort {
  constructor(private readonly broker: GatewayCommandResponseBroker) {}

  publish(input: CapabilityApprovalEventInput): void {
    this.broker.publishOwnedTurnEvent({
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      conversationId: input.conversationId,
      turnId: input.turnId,
    }, {
      kind: 'capability.approval_required',
      invocationId: input.invocationId,
    });
  }
}
