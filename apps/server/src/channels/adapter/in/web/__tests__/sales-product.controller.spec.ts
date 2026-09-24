import { describe, expect, it, vi } from 'vitest';
import { SalesProductController } from '../sales-product.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000002';

function controller() {
  const sabangnetImport = {
    import: vi.fn().mockResolvedValue({ dryRun: true }),
  };
  const value = new SalesProductController(
    {} as never,
    sabangnetImport as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { value, sabangnetImport };
}

describe('SalesProductController Sabangnet import selection', () => {
  it('parses versioned JSON selections and defaults to an empty selection', async () => {
    const { value, sabangnetImport } = controller();
    const files: never[] = [];
    const selections = [{ salesProductId: PRODUCT_ID, expectedVersion: 7 }];

    await expect(value.importSabangnet(
      ORGANIZATION_ID,
      files,
      'true',
      JSON.stringify(selections),
    )).resolves.toEqual({ dryRun: true });
    expect(sabangnetImport.import).toHaveBeenCalledWith(ORGANIZATION_ID, files, true, selections);

    await value.importSabangnet(ORGANIZATION_ID, files, 'false');
    expect(sabangnetImport.import).toHaveBeenLastCalledWith(ORGANIZATION_ID, files, false, []);
  });

  it('rejects malformed selection JSON before calling the import service', () => {
    const { value, sabangnetImport } = controller();

    expect(() => value.importSabangnet(ORGANIZATION_ID, [], 'true', '{bad json'))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: { reason: 'APPLY_EXISTING_INVALID' } }));
    expect(sabangnetImport.import).not.toHaveBeenCalled();
  });
});
