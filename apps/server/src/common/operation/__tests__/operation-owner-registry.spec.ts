import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { OperationOwnerPort } from '../application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../application/port/out/owner/operation-owner.decorator';
import { OperationOwnerRegistry } from '../application/service/operation-owner.registry';

abstract class StubOwner implements OperationOwnerPort {
  abstract readonly kind: string;
  async plan() {
    return { plan: {}, lockKeys: ['org'] };
  }
  async finalize() {
    return {};
  }
}

@Injectable() @OperationOwner() class CatalogOwner extends StubOwner { readonly kind = 'channels.wing_catalog'; }
@Injectable() @OperationOwner() class CatalogOwnerAgain extends StubOwner { readonly kind = 'channels.wing_catalog'; }
@Injectable() @OperationOwner() class ReviewsOwner extends StubOwner { readonly kind = 'orders.coupang_reviews'; }
@Injectable() class UnmarkedOwner extends StubOwner { readonly kind = 'content.thumbnail_generate'; }

async function boot(...owners: Array<new () => StubOwner>) {
  const module = await Test.createTestingModule({ imports: [DiscoveryModule], providers: [OperationOwnerRegistry, ...owners] }).compile();
  await module.init();
  return module.get(OperationOwnerRegistry);
}

describe('operation owner registration at boot', () => {
  it('registers every provider marked @OperationOwner() by its kind', async () => {
    const registry = await boot(CatalogOwner, ReviewsOwner, UnmarkedOwner);
    expect(registry.find('channels.wing_catalog')).toBeInstanceOf(CatalogOwner);
    expect(registry.find('orders.coupang_reviews')).toBeInstanceOf(ReviewsOwner);
    expect(registry.find('content.thumbnail_generate')).toBeUndefined();
  });

  it('refuses to boot when two owners claim the same kind', async () => {
    await expect(boot(CatalogOwner, CatalogOwnerAgain)).rejects.toThrow('Operation kind channels.wing_catalog is registered twice');
  });
});
