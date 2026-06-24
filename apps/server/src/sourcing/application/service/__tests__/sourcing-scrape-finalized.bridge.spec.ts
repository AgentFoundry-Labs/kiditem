import { describe, expect, it, vi } from 'vitest';
import type { AgentRunFinalizedEvent } from '../../../../agent-os/application/event/agent-run-events';
import { SourcingScrapeFinalizedBridge } from '../sourcing-scrape-finalized.bridge';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

function makeRepo() {
  return {
    upsertSourced: vi.fn().mockResolvedValue({
      id: 'candidate-1',
      organizationId: ORG,
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    }),
  };
}

function makeAlerts() {
  return {
    start: vi.fn().mockResolvedValue({ id: 'alert-1' }),
    closeBySource: vi.fn().mockResolvedValue({ id: 'alert-1' }),
  };
}

const BASE_EVENT: AgentRunFinalizedEvent = {
  organizationId: ORG,
  requestId: REQUEST_ID,
  runId: RUN_ID,
  agentType: 'sourcing',
  source: 'sourcing.scrape_url',
  sourceResourceType: null,
  sourceResourceId: null,
  requestedByUserId: USER_ID,
  requestStatus: 'succeeded',
  status: 'succeeded',
};

describe('SourcingScrapeFinalizedBridge', () => {
  it('projects successful sourcing.scrape_url output into a sourced candidate and links the success alert to detail', async () => {
    const repo = makeRepo();
    const alerts = makeAlerts();
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      output: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/123.html',
        scraped_data: {
          page_type: 'detail',
          source_url: 'https://detail.1688.com/offer/123.html',
          source_platform: '1688',
          title: '아동용 스니커즈',
          category_name: '아동화',
          images: ['//cbu01.alicdn.com/img/main.jpg'],
          price_min: 12.5,
          description_text: '편한 착용감',
        },
      },
    });

    expect(repo.upsertSourced).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      sourceUrl: 'https://detail.1688.com/offer/123.html',
      sourcePlatform: 'ALIBABA_1688',
      name: '아동용 스니커즈',
      category: '아동화',
      costCny: 12.5,
      triggeredByUserId: USER_ID,
      thumbnailUrl: 'https://cbu01.alicdn.com/img/main.jpg',
      imageUrl: 'https://cbu01.alicdn.com/img/main.jpg',
      images: [
        expect.objectContaining({
          url: 'https://cbu01.alicdn.com/img/main.jpg',
          role: 'product',
          isPrimary: true,
          source: 'sourcing-scrape-url',
        }),
      ],
    }));
    expect(alerts.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      operationKey: `sourcing-scrape:${REQUEST_ID}`,
      type: 'sourcing_scrape_url',
      sourceType: 'agent_run_request',
      sourceId: REQUEST_ID,
      actorUserId: USER_ID,
      href: '/product-pipeline/collected-products/candidate-1',
      metadata: expect.objectContaining({
        agentType: 'sourcing',
        source: 'sourcing.scrape_url',
        runId: RUN_ID,
        candidateId: 'candidate-1',
      }),
    }));
    expect(alerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'succeeded',
      expect.objectContaining({
        href: '/product-pipeline/collected-products/candidate-1',
        metadata: expect.objectContaining({
          runId: RUN_ID,
          candidateId: 'candidate-1',
        }),
      }),
    );
  });

  it('does not write Alibaba USD extractor prices into costCny', async () => {
    const repo = makeRepo();
    const alerts = makeAlerts();
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      output: {
        ok: true,
        platform: 'ALIBABA',
        source_url: 'https://www.alibaba.com/product-detail/item.html',
        scraped_data: {
          page_type: 'detail',
          title: 'Alibaba toy',
          source_url: 'https://www.alibaba.com/product-detail/item.html',
          source_platform: 'ALIBABA',
          price_min: 3.5,
          currency: 'USD',
          images: ['https://cdn.example.com/item.jpg'],
        },
      },
    });

    expect(repo.upsertSourced).toHaveBeenCalledWith(expect.objectContaining({
      sourcePlatform: 'ALIBABA',
      costCny: null,
    }));
  });

  it('fails the operation alert and does not create a candidate when runtime output has no scraped data', async () => {
    const repo = makeRepo();
    const alerts = makeAlerts();
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      output: {
        ok: false,
        source_url: 'https://detail.1688.com/offer/123.html',
        error: 'Failed to extract data',
        requiresRecovery: true,
        recommendedSkillKey: 'sourcing.magic_scraper',
      },
    });

    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(alerts.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      operationKey: `sourcing-scrape:${REQUEST_ID}`,
      type: 'sourcing_scrape_url',
      sourceType: 'agent_run_request',
      sourceId: REQUEST_ID,
      actorUserId: USER_ID,
      href: '/product-pipeline/collected-products',
      metadata: expect.objectContaining({
        agentType: 'sourcing',
        source: 'sourcing.scrape_url',
        runId: RUN_ID,
      }),
    }));
    expect(alerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'failed',
      expect.objectContaining({
        message: 'Failed to extract data',
        metadata: expect.objectContaining({
          runId: RUN_ID,
          errorCode: 'sourcing_scrape_empty_output',
          requiresRecovery: true,
          recommendedSkillKey: 'sourcing.magic_scraper',
        }),
      }),
    );
  });

  it('keeps a successful candidate projection successful when only the alert close fails', async () => {
    const repo = makeRepo();
    const alerts = {
      start: vi.fn().mockResolvedValue({ id: 'alert-1' }),
      closeBySource: vi.fn().mockRejectedValue(new Error('alert store unavailable')),
    };
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await expect(bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      output: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/123.html',
        scraped_data: {
          page_type: 'detail',
          source_url: 'https://detail.1688.com/offer/123.html',
          source_platform: '1688',
          title: '아동용 스니커즈',
          images: ['https://cdn.example.com/main.jpg'],
        },
      },
    })).resolves.toBeUndefined();

    expect(repo.upsertSourced).toHaveBeenCalledTimes(1);
    expect(alerts.start).toHaveBeenCalledTimes(1);
    expect(alerts.closeBySource).toHaveBeenCalledTimes(1);
  });

  it('fails the operation alert when scraped_data is malformed before repository upsert', async () => {
    const repo = makeRepo();
    const alerts = makeAlerts();
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await expect(bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      output: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/123.html',
        scraped_data: {
          page_type: 'detail',
          source_url: 'https://detail.1688.com/offer/123.html',
          source_platform: '1688',
          images: ['https://cdn.example.com/main.jpg'],
        },
      },
    })).resolves.toBeUndefined();

    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(alerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'failed',
      expect.objectContaining({
        message: 'sourcing_scrape_missing_title',
        metadata: expect.objectContaining({
          errorCode: 'sourcing_scrape_empty_output',
        }),
      }),
    );
  });

  it('ignores finalized events outside the sourcing scrape-url route', async () => {
    const repo = makeRepo();
    const alerts = makeAlerts();
    const bridge = new SourcingScrapeFinalizedBridge(repo as never, alerts as never);

    await bridge.onAgentRunFinalized({
      ...BASE_EVENT,
      agentType: 'rules_evaluation',
      source: 'rules.evaluation',
      output: { ok: true },
    });

    expect(repo.upsertSourced).not.toHaveBeenCalled();
    expect(alerts.closeBySource).not.toHaveBeenCalled();
  });
});
