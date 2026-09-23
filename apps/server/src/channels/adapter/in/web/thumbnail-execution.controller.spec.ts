import 'reflect-metadata';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ChannelsThumbnailExecutionPort } from '../../../application/port/in/thumbnail-execution.port';
import { ThumbnailExecutionController } from './thumbnail-execution.controller';

const ORG = '00000000-0000-4000-8000-000000000001';
const GENERATION = '00000000-0000-4000-8000-000000000002';
const user = { id: '00000000-0000-4000-8000-000000000003' } as never;

/** 입력이 틀리면 owner 에 닿기 전에 거절해야 한다. */
const unreachable = new Proxy({}, { get: () => () => { throw new Error('owner must not be called'); } }) as ChannelsThumbnailExecutionPort;

describe('ThumbnailExecutionController', () => {
  it('publishes prepare, report, resend, not-applied, latest-status and dismiss routes under channels/thumbnail-executions', () => {
    expect(Reflect.getMetadata('path', ThumbnailExecutionController)).toBe('channels/thumbnail-executions');
    const route = (name: keyof ThumbnailExecutionController) => ({
      path: Reflect.getMetadata('path', ThumbnailExecutionController.prototype[name]),
      method: Reflect.getMetadata('method', ThumbnailExecutionController.prototype[name]),
    });
    expect(route('prepare')).toEqual({ path: '/', method: RequestMethod.POST });
    expect(route('report')).toEqual({ path: ':executionId/report', method: RequestMethod.POST });
    expect(route('listLatest')).toEqual({ path: '/', method: RequestMethod.GET });
    expect(route('listingChoices')).toEqual({ path: 'listing-choices', method: RequestMethod.GET });
    expect(route('dismissFailed')).toEqual({ path: 'failed/:generationId', method: RequestMethod.DELETE });
    expect(route('resend')).toEqual({ path: ':executionId/resend', method: RequestMethod.POST });
    expect(route('confirmApplied')).toEqual({ path: ':executionId/applied', method: RequestMethod.POST });
    expect(route('markNotApplied')).toEqual({ path: ':executionId/not-applied', method: RequestMethod.POST });
  });

  it('rejects bodies and queries outside the shared contract before the owner runs', async () => {
    const controller = new ThumbnailExecutionController(unreachable);
    await expect(controller.prepare(ORG, user, { generationId: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.prepare(ORG, user, { generationId: GENERATION, organizationId: ORG })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.report(ORG, user, GENERATION, { outcome: 'maybe' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.report(ORG, user, GENERATION, { outcome: 'definitive_failure' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listLatest(ORG, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listLatest(ORG, `${GENERATION},bad`)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes the organization from the session and splits the generation id list', async () => {
    const seen: unknown[] = [];
    const owner = {
      listLatest: async (input: unknown) => { seen.push(input); return []; },
    } as unknown as ChannelsThumbnailExecutionPort;
    await expect(new ThumbnailExecutionController(owner).listLatest(ORG, ` ${GENERATION} ,${GENERATION}`)).resolves.toEqual({ items: [] });
    expect(seen).toEqual([{ organizationId: ORG, generationIds: [GENERATION, GENERATION] }]);
  });
});
