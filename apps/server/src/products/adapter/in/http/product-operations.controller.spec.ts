import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ProductOperationsController } from './product-operations.controller';

describe('ProductOperationsController', () => {
  it('keeps ABC policy reads and mutations within the authenticated organization', async () => {
    const abc = {
      getPolicy: vi.fn().mockResolvedValue({ metric: 'SALES_QUANTITY' }),
      updatePolicy: vi.fn().mockResolvedValue({ metric: 'SALES_AMOUNT' }),
      recalculate: vi.fn().mockResolvedValue({ changedProductCount: 0 }),
    };
    const controller = new ProductOperationsController(
      {} as never, {} as never, {} as never, abc as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const body = { metric: 'SALES_AMOUNT', periodDays: 90, aCumulativeThreshold: 60, bCumulativeThreshold: 85 };

    await controller.getAbcPolicy(organizationId);
    await controller.updateAbcPolicy(organizationId, body);
    await controller.recalculateAbcGrade(organizationId);

    expect(abc.getPolicy).toHaveBeenCalledWith(organizationId);
    expect(abc.updatePolicy).toHaveBeenCalledWith(organizationId, body);
    expect(abc.recalculate).toHaveBeenCalledWith(organizationId);
  });

  it('passes the authenticated organization to recipe component candidate search', async () => {
    const candidates = { search: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new ProductOperationsController(
      {} as never,
      {} as never,
      candidates as never,
      {} as never,
    );

    await expect(controller.listRecipeComponentCandidates(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20 },
    )).resolves.toEqual({ items: [] });
    expect(candidates.search).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20 },
    );
  });

  it('forwards recipe snapshots and preserves a 409 current projection', async () => {
    const conflict = new ConflictException({ message: 'changed', currentRecipe: [{ id: 'component-1' }] });
    const recipes = { replaceRecipe: vi.fn().mockRejectedValue(conflict) };
    const controller = new ProductOperationsController({} as never, recipes as never, {} as never, {} as never);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const user = { id: '00000000-0000-4000-8000-000000000002' };
    const variantId = '00000000-0000-4000-8000-000000000003';
    const body = { components: [], expectedRecipe: [] };

    await expect(controller.replaceRecipe(organizationId, user as never, variantId, body)).rejects.toBe(conflict);
    expect(recipes.replaceRecipe).toHaveBeenCalledWith(organizationId, user.id, variantId, body);
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.getResponse()).toMatchObject({ currentRecipe: [{ id: 'component-1' }] });
  });

  it('forwards an authenticated create-if-empty recipe batch', async () => {
    const recipes = {
      planCreateIfEmpty: vi.fn().mockResolvedValue({
        pendingProductVariantIds: [],
        unchangedProductVariantIds: [],
      }),
      createIfEmpty: vi.fn().mockResolvedValue({
        appliedProductVariantIds: [],
        unchangedProductVariantIds: [],
      }),
    };
    const controller = new ProductOperationsController({} as never, recipes as never, {} as never, {} as never);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const user = { id: '00000000-0000-4000-8000-000000000002' };
    const body = { recipes: [] };

    await controller.planRecipesIfEmpty(organizationId, body);
    await controller.createRecipesIfEmpty(organizationId, user as never, body);

    expect(recipes.planCreateIfEmpty).toHaveBeenCalledWith(organizationId, body);
    expect(recipes.createIfEmpty).toHaveBeenCalledWith(organizationId, user.id, body);
  });
});
