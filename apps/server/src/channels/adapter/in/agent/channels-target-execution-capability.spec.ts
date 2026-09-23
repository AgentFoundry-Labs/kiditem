import { describe, expect, it, vi } from 'vitest';
import type { TargetExecutionResult } from '@kiditem/shared/sales-product';
import { ChannelsCapabilityCompositionAdapter } from './channels-capability-composition.adapter';
import { RegistrationTargetExecutionController } from '../web/registration-target-execution.controller';
import type { AuthUser } from '../../../../auth/auth.types';
import type { RegistrationExecutionPort } from '../../../application/port/in/capability/registration-execution.port';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { organizationId: id(1), initiatingUserId: id(2), executionId: id(3), ownerIdempotencyKey: 'server-intent' };
const response: TargetExecutionResult = {
  executionId: id(4), targetId: id(5), channelAccountId: id(6), status: 'prepared',
  providerOutcome: 'not_attempted', payloadHash: 'a'.repeat(64), leaseToken: null, maySubmit: false,
  externalListingId: null, result: null,
  payload: {
    targetId: id(5), targetVersion: 1, channelAccountId: id(6), kind: 'register',
    channelListingId: null, applyCompositionTemplate: false, registrationInput: {}, supplyPrices: [],
    product: {
      id: id(7), code: 'KID00000001', ownCode: null, sabangnetGoodsNo: null, sourceRecordId: null,
      sourcePlatform: null, sourceUrl: null,
      name: '테스트 상품', shortName: null, englishName: null, printName: null, modelName: null,
      modelNo: null, brand: null, manufacturer: null, originCountry: null, originRegion: null,
      keywords: [], standardCategory: null, description: '', targetAudience: null, ageGroup: null,
      productSize: null, colorVariantNames: [], boxSetQuantity: null, registrationDefaults: null,
      status: 'active', taxType: 'taxable',
      deliveryFeeType: null, deliveryFee: null, optionAxes: [], stockManaged: false,
      imageUrls: [], detailHtml: null, extraDetailHtml: [], noticeCategory: null, noticeValues: [],
      certifications: [], kcStatus: 'unknown' as const, importDeclarationNo: null, adminMemo: null, version: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      options: [], channelOverrides: [], channelListings: [],
    },
  },
};

function setup() {
  const methods = { prepareTargetExecution: vi.fn().mockResolvedValue(response),
    startTargetExecution: vi.fn().mockResolvedValue(response),
    getTargetExecution: vi.fn().mockResolvedValue(response),
    reportTargetExecution: vi.fn().mockResolvedValue(response) };
  const port = methods as unknown as RegistrationExecutionPort;
  const adapter = new ChannelsCapabilityCompositionAdapter({} as never, {} as never, port);
  const capability = (key: string) => adapter.compositions.find(item => item.definition.key === `channels.${key}`)!.implementation;
  return { methods, capability, web: new RegistrationTargetExecutionController(port) };
}

describe('Channels Web and Agent execution boundary', () => {
  it('prepares through the same port with authenticated actor/scope and server-owned Agent intent', async () => {
    const { methods, capability, web } = setup();
    const input = { targetId: id(5), expectedVersion: 1, kind: 'register' };
    expect(await capability('prepare_target_execution').invoke({ context, input })).toEqual(response);
    await web.prepare(id(1), { id: id(2) } as AuthUser, id(5), {
      expectedVersion: 1, kind: 'register', idempotencyKey: 'server-intent',
    });
    expect(methods.prepareTargetExecution.mock.calls).toEqual(Array(2).fill([
      id(1), id(5), id(2), { expectedVersion: 1, kind: 'register', idempotencyKey: 'server-intent', applyCompositionTemplate: false },
    ]));
  });

  it('rejects Agent-supplied organization or idempotency authority before reaching the owner', async () => {
    const { capability, methods } = setup();
    for (const extra of [{ organizationId: id(99) }, { idempotencyKey: 'client-override' }]) {
      await expect(capability('prepare_target_execution').invoke({ context, input: {
        targetId: id(5), expectedVersion: 1, kind: 'register', ...extra,
      } })).rejects.toThrow();
    }
    await expect(capability('prepare_target_execution').invoke({ context: { ...context, ownerIdempotencyKey: undefined },
      input: { targetId: id(5), expectedVersion: 1, kind: 'register' } })).rejects.toThrow('owner_idempotency_key_required');
    expect(methods.prepareTargetExecution).not.toHaveBeenCalled();
  });

  it('returns the owner maySubmit fence without authorizing a repeated send', async () => {
    const { capability, methods } = setup();
    expect(await capability('start_target_execution').invoke({ context, input: { executionId: id(4) } })).toMatchObject({ maySubmit: false });
    expect(methods.startTargetExecution).toHaveBeenCalledWith(id(1), id(4), id(2));
  });

  it('reports only typed provider evidence with the execution hash and lease', async () => {
    const { capability, methods } = setup();
    const report = { leaseToken: id(8), payloadHash: 'a'.repeat(64), outcome: 'uncertain', evidence: { channelAccountId: id(6) } };
    await capability('report_target_execution').invoke({ context, input: { executionId: id(4), ...report } });
    expect(methods.reportTargetExecution).toHaveBeenCalledWith(id(1), id(4), id(2), report);
    await expect(capability('report_target_execution').invoke({ context, input: { executionId: id(4), ...report, outcome: 'filled' } })).rejects.toThrow();
  });
});
