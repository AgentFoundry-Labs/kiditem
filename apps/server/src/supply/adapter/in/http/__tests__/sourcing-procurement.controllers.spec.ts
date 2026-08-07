import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../../auth/decorators/roles.decorator';
import { ProcurementTestIntentsController } from '../procurement-test-intents.controller';
import { SupplierOfferSnapshotsController } from '../supplier-offer-snapshots.controller';
import type { SupplySourcingProcurementPort } from '../../../../application/port/in/procurement/supply-sourcing-procurement.port';

function port() {
  return {
    createOfferSnapshot: vi.fn(),
    findOfferSnapshot: vi.fn(),
    listOfferSnapshots: vi.fn(),
    createTestIntent: vi.fn(),
    getTestIntent: vi.fn(),
    listTestIntents: vi.fn(),
  } as unknown as SupplySourcingProcurementPort;
}

describe('sourcing procurement HTTP adapters', () => {
  it('restricts all offer-snapshot reads and writes to owner/admin', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, SupplierOfferSnapshotsController),
    ).toEqual(['owner', 'admin']);
  });

  it('injects organization scope into snapshot creation instead of reading it from body', async () => {
    const procurement = port();
    vi.mocked(procurement.createOfferSnapshot).mockResolvedValue({
      duplicate: true,
      snapshot: { id: 'snapshot-1' } as never,
    });
    const controller = new SupplierOfferSnapshotsController(procurement);
    const dto = {
      evidenceObservationId: 'evidence-1',
      identityStatus: 'offer_only' as const,
      sourcePlatform: '1688',
      externalOfferId: 'offer-1',
      productName: 'Magnetic blocks',
      currency: 'CNY',
      capturedAt: new Date('2026-08-01T00:00:00.000Z'),
      priceTiers: [],
    };

    await controller.create('org-1', dto);

    expect(procurement.createOfferSnapshot).toHaveBeenCalledWith({
      organizationId: 'org-1',
      ...dto,
    });
  });

  it('returns 404 for an organization-scoped snapshot miss', async () => {
    const procurement = port();
    vi.mocked(procurement.findOfferSnapshot).mockResolvedValue(null);
    const controller = new SupplierOfferSnapshotsController(procurement);

    await expect(controller.get('org-1', 'snapshot-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(procurement.findOfferSnapshot).toHaveBeenCalledWith({
      organizationId: 'org-1', id: 'snapshot-1',
    });
  });

  it('exposes procurement intents through GET only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProcurementTestIntentsController)).toBe(
      'procurement-test-intents',
    );
    const routes = Object.getOwnPropertyNames(
      ProcurementTestIntentsController.prototype,
    )
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        name,
        method: Reflect.getMetadata(
          METHOD_METADATA,
          ProcurementTestIntentsController.prototype[
            name as keyof ProcurementTestIntentsController
          ],
        ),
      }));
    expect(routes).toEqual([
      { name: 'list', method: RequestMethod.GET },
      { name: 'get', method: RequestMethod.GET },
    ]);
  });

  it('scopes intent list and detail reads to the active organization', async () => {
    const procurement = port();
    vi.mocked(procurement.listTestIntents).mockResolvedValue({
      items: [], total: 0, page: 1, limit: 50,
    });
    vi.mocked(procurement.getTestIntent).mockResolvedValue({ id: 'intent-1' } as never);
    const controller = new ProcurementTestIntentsController(procurement);

    await controller.list('org-1', { page: 1, limit: 50, status: 'proposed' });
    await controller.get('org-1', 'intent-1');

    expect(procurement.listTestIntents).toHaveBeenCalledWith({
      organizationId: 'org-1', page: 1, limit: 50, status: 'proposed',
    });
    expect(procurement.getTestIntent).toHaveBeenCalledWith({
      organizationId: 'org-1', id: 'intent-1',
    });
  });
});
