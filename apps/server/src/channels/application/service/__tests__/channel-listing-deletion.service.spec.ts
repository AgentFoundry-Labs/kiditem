import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelListingDeletionService } from '../channel-listing-deletion.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LISTING = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';

function build(passwordFails = false) {
  const authorizeDeletion = vi.fn().mockResolvedValue({
    operationId: OPERATION,
    listingId: LISTING,
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    externalId: '16311428128',
    displayName: '과일바구니',
    channel: 'coupang',
    expectedVendorId: 'A00012345',
    status: 'executing',
    providerOutcome: 'uncertain',
  });
  const completeDeletion = vi.fn().mockResolvedValue({
    operationId: OPERATION,
    listingId: LISTING,
    externalId: '16311428128',
    isActive: false,
    status: 'succeeded',
    providerOutcome: 'succeeded',
  });
  const markDeletionUnresolved = vi.fn().mockResolvedValue({
    operationId: OPERATION,
    status: 'reconciling',
    providerOutcome: 'uncertain',
  });
  const assertPassword = vi.fn().mockImplementation(async () => {
    if (passwordFails) throw new ForbiddenException('삭제 비밀번호가 일치하지 않습니다.');
  });
  const service = new ChannelListingDeletionService(
    { authorizeDeletion, completeDeletion, markDeletionUnresolved } as never,
    { assertPassword },
  );
  return { service, authorizeDeletion, completeDeletion, markDeletionUnresolved, assertPassword };
}

describe('ChannelListingDeletionService durable operation', () => {
  it('verifies the password before creating an actor-bound durable operation', async () => {
    const harness = build();

    await expect(harness.service.authorize({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      password: 'correct-horse',
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    })).resolves.toMatchObject({ operationId: OPERATION, expectedVendorId: 'A00012345' });

    expect(harness.assertPassword).toHaveBeenCalledWith(ORG, 'correct-horse');
    expect(harness.authorizeDeletion).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    }));
  });

  it('does not reveal listing facts or create an operation when password verification fails', async () => {
    const harness = build(true);

    await expect(harness.service.authorize({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      password: 'wrong',
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    })).rejects.toThrow(ForbiddenException);

    expect(harness.authorizeDeletion).not.toHaveBeenCalled();
  });

  it('refuses a browser-controlled completion because only independent reconciliation may deactivate', async () => {
    const harness = build();

    await expect(harness.service.complete({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
    })).rejects.toThrow(BadRequestException);

    expect(harness.assertPassword).not.toHaveBeenCalled();
    expect(harness.completeDeletion).not.toHaveBeenCalled();
  });

  it('records unknown browser outcomes as unresolved without deactivating the listing', async () => {
    const harness = build();

    await expect(harness.service.markUnresolved({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
      reason: 'extension_timeout',
    })).resolves.toEqual({
      operationId: OPERATION,
      status: 'reconciling',
      providerOutcome: 'uncertain',
    });
    expect(harness.markDeletionUnresolved).toHaveBeenCalled();
  });

  it('requires strict extension evidence before completion reaches persistence', async () => {
    const harness = build();

    await expect(harness.service.complete({
      organizationId: ORG,
      userId: USER,
      listingId: LISTING,
      operationId: OPERATION,
      evidence: { vendorId: '', source: '' },
    })).rejects.toThrow(BadRequestException);
    expect(harness.completeDeletion).not.toHaveBeenCalled();
  });
});
