import { describe, expect, it, vi } from 'vitest';
import { RocketWorkbookProgressService } from './rocket-workbook-progress.service';

function repository(result: {
  verifiedGeneration: bigint;
  intents: Array<{
    intentKey: string;
    status: 'prepared' | 'finalized' | 'aborted';
    finalizedGeneration: bigint | null;
  }>;
}) {
  return { read: vi.fn().mockResolvedValue(result) };
}

describe('RocketWorkbookProgressService', () => {
  it('waits for every positive workbook line before reading transmission state', async () => {
    const progressRepository = repository({ verifiedGeneration: 8n, intents: [] });
    const service = new RocketWorkbookProgressService(progressRepository as never);

    await expect(service.read({
      transaction: {},
      organizationId: 'organization-1',
      exportGeneration: 8n,
      allPositiveLinesCollected: false,
      intentKeys: [],
    })).resolves.toEqual({
      status: 'awaiting_coupang_confirmation',
      verifiedGeneration: 8n,
    });
    expect(progressRepository.read).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'collected without a prepared intent',
      intents: [],
      verifiedGeneration: 8n,
      expected: 'orders_collected',
    },
    {
      name: 'prepared transmission',
      intents: [{ intentKey: 'rocket:shipment', status: 'prepared' as const, finalizedGeneration: null }],
      verifiedGeneration: 8n,
      expected: 'sellpia_transmitting',
    },
    {
      name: 'aborted transmission',
      intents: [{ intentKey: 'rocket:shipment', status: 'aborted' as const, finalizedGeneration: null }],
      verifiedGeneration: 8n,
      expected: 'failed',
    },
    {
      name: 'finalized transmission before inventory refresh',
      intents: [{ intentKey: 'rocket:shipment', status: 'finalized' as const, finalizedGeneration: 9n }],
      verifiedGeneration: 8n,
      expected: 'awaiting_inventory_sync',
    },
    {
      name: 'verified newer generation',
      intents: [{ intentKey: 'rocket:shipment', status: 'finalized' as const, finalizedGeneration: 9n }],
      verifiedGeneration: 9n,
      expected: 'completed',
    },
  ])('projects $name', async ({ intents, verifiedGeneration, expected }) => {
    const progressRepository = repository({ verifiedGeneration, intents });
    const service = new RocketWorkbookProgressService(progressRepository as never);

    await expect(service.read({
      transaction: {},
      organizationId: 'organization-1',
      exportGeneration: 8n,
      allPositiveLinesCollected: true,
      intentKeys: intents.map(({ intentKey }) => intentKey),
    })).resolves.toEqual({ status: expected, verifiedGeneration });
  });

  it('does not complete until every expected intent exists and is finalized', async () => {
    const progressRepository = repository({
      verifiedGeneration: 10n,
      intents: [{
        intentKey: 'rocket:shipment',
        status: 'finalized',
        finalizedGeneration: 9n,
      }],
    });
    const service = new RocketWorkbookProgressService(progressRepository as never);

    await expect(service.read({
      transaction: {},
      organizationId: 'organization-1',
      exportGeneration: 8n,
      allPositiveLinesCollected: true,
      intentKeys: ['rocket:shipment', 'rocket:milkrun'],
    })).resolves.toEqual({
      status: 'orders_collected',
      verifiedGeneration: 10n,
    });
  });
});
