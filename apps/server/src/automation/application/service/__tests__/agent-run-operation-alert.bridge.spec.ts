import { describe, it, expect, vi } from 'vitest';
import { AgentRunOperationAlertBridge } from '../agent-run-operation-alert.bridge';
import type { AgentRunFinalizedEvent } from '../../../../agent-os/application/event/agent-run-events';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

function makeOperationAlerts(overrides: {
  closeBySource?: ReturnType<typeof vi.fn>;
  start?: ReturnType<typeof vi.fn>;
  fail?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    closeBySource: overrides.closeBySource ?? vi.fn().mockResolvedValue({}),
    start: overrides.start ?? vi.fn().mockResolvedValue({}),
    fail: overrides.fail ?? vi.fn().mockResolvedValue({}),
  };
}

// AgentRunFinalizedEvent now carries routing metadata (`agentType`, `source`,
// `sourceResourceType`, `sourceResourceId`, `requestedByUserId`). The bridge
// keys close-by-source on `requestId` and uses `requestedByUserId` + `source`
// only on the fallback create path. The shape is strict so the helper here
// keeps the spec compiling against the canonical contract.
const BASE_EVENT: Omit<AgentRunFinalizedEvent, 'status'> = {
  organizationId: ORG,
  requestId: REQUEST_ID,
  runId: RUN_ID,
  agentType: 'rules_evaluation',
  source: 'rules.evaluation',
  sourceResourceType: null,
  sourceResourceId: null,
  requestedByUserId: USER_ID,
};

describe('AgentRunOperationAlertBridge', () => {
  it('closes the source-linked operation alert with succeeded on a successful AgentRun', async () => {
    const operationAlerts = makeOperationAlerts();
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      ...BASE_EVENT,
      status: 'succeeded',
      output: { ok: true },
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'succeeded',
      expect.objectContaining({
        metadata: expect.objectContaining({ runId: RUN_ID }),
      }),
    );
    // Fallback create must not fire when an existing alert was closed.
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('closes the source-linked operation alert with failed on terminal AgentRun failure', async () => {
    const operationAlerts = makeOperationAlerts();
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      ...BASE_EVENT,
      status: 'failed',
      errorCode: 'gemini_timeout',
      errorMessage: 'request timed out',
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'failed',
      expect.objectContaining({
        message: 'request timed out',
        metadata: expect.objectContaining({
          runId: RUN_ID,
          errorCode: 'gemini_timeout',
        }),
      }),
    );
    // Existing alert closed → no synthesized fallback.
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('synthesizes a fallback failure alert when no producer alert exists and the run was user-triggered', async () => {
    const operationAlerts = makeOperationAlerts({
      closeBySource: vi.fn().mockResolvedValue(null),
    });
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      ...BASE_EVENT,
      agentType: 'image_edit',
      source: 'ai.image_edit',
      status: 'failed',
      errorCode: 'gemini_quota',
      errorMessage: 'quota exceeded',
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalled();
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        operationKey: `agent_run_request:${REQUEST_ID}`,
        type: 'agent_run_failure',
        sourceType: 'agent_run_request',
        sourceId: REQUEST_ID,
        actorUserId: USER_ID,
        href: '/product-content?tab=assets',
        severity: 'error',
        metadata: expect.objectContaining({
          agentType: 'image_edit',
          source: 'ai.image_edit',
          requestId: REQUEST_ID,
          runId: RUN_ID,
          errorCode: 'gemini_quota',
        }),
      }),
    );
    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORG,
      `agent_run_request:${REQUEST_ID}`,
      expect.objectContaining({
        message: 'quota exceeded',
        severity: 'error',
        metadata: expect.objectContaining({ errorCode: 'gemini_quota' }),
      }),
    );
  });

  it.each([
    { source: 'ai.image_edit', href: '/product-content?tab=assets' },
    { source: 'advertising.ad_strategy.manual', href: '/ad-ops' },
    { source: 'sourcing.scrape_url', href: '/sourcing' },
    { source: 'ai.thumbnail_auto_edit', href: '/thumbnails' },
    { source: 'ai.thumbnail_generate', href: '/thumbnails' },
    { source: 'thumbnail_generate', href: '/thumbnails' },
    { source: 'rules.evaluation', href: '/dashboard' },
    { source: 'rules.suggest', href: '/dashboard' },
    { source: 'mystery.unknown.source', href: '/dashboard' },
  ])('maps fallback href for $source → $href', async ({ source, href }) => {
    const operationAlerts = makeOperationAlerts({
      closeBySource: vi.fn().mockResolvedValue(null),
    });
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);

    await bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      source,
      status: 'failed',
      errorCode: 'boom',
      errorMessage: 'boom',
    });

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({ href }),
    );
  });

  it('does NOT synthesize a fallback when the run has no requestedByUserId (system/cron)', async () => {
    const operationAlerts = makeOperationAlerts({
      closeBySource: vi.fn().mockResolvedValue(null),
    });
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      ...BASE_EVENT,
      requestedByUserId: null,
      status: 'failed',
      errorCode: 'boom',
      errorMessage: 'boom',
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalled();
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('does NOT synthesize a fallback on a succeeded run that had no producer alert', async () => {
    const operationAlerts = makeOperationAlerts({
      closeBySource: vi.fn().mockResolvedValue(null),
    });
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      ...BASE_EVENT,
      status: 'succeeded',
      output: { ok: true },
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalled();
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('swallows errors from closeBySource so the bridge never crashes the bus', async () => {
    const operationAlerts = makeOperationAlerts({
      closeBySource: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);

    await expect(
      bridge.onAgentRunFinalized({
        ...BASE_EVENT,
        status: 'succeeded',
      }),
    ).resolves.toBeUndefined();
  });
});
