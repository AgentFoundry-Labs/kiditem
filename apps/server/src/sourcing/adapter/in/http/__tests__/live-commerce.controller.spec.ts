import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LiveCommerceController } from '../live-commerce.controller';
import { TaobaoLiveRequestDto } from '../dto/live-commerce.dto';

describe('Taobao direct HTTP contract', () => {
  it('registers the source-owner attempt POST route', () => {
    expect(Reflect.getMetadata('path', LiveCommerceController)).toBe('sourcing/live-commerce');
    expect(Reflect.getMetadata('path', LiveCommerceController.prototype.collectTaobao)).toBe('taobao/attempts');
    expect(Reflect.getMetadata('method', LiveCommerceController.prototype.collectTaobao)).toBe(1);
  });

  it.each(['20260904', '2026-09-04', ' 2026-09-04 '])('accepts the existing explicit date form %s and provider page size', async (queryDate) => {
    const input = plainToInstance(TaobaoLiveRequestDto, { queryDate, liveIds: ['room-1'], pageSize: 75 });
    expect(await validate(input, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(input.queryDate).toBe(queryDate.trim());
    expect(input.pageSize).toBe(75);
  });

  it('validates query selection and rejects malformed JSON, date and client organization scope', async () => {
    const query = plainToInstance(TaobaoLiveRequestDto, { liveIds: '["room-1"]' });
    expect(query.liveIds).toEqual(['room-1']);
    for (const input of [{ liveIds: 'not-json' }, { queryDate: 'yesterday' }, { organizationId: 'client-org' }]) {
      expect(await validate(plainToInstance(TaobaoLiveRequestDto, input), { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
    }
  });
});
