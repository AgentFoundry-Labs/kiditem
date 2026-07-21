import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryImportDto } from './dto/sellpia-inventory-import.dto';
import { SellpiaInventoryImportController } from './sellpia-inventory-import.controller';
import type { SellpiaInventoryImportPort } from '../../../application/port/in/stock/sellpia-inventory-import.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000003';

describe('SellpiaInventoryImportController', () => {
  it('exposes exactly POST inventory/sellpia-sync/import', () => {
    expect(Reflect.getMetadata('path', SellpiaInventoryImportController)).toBe(
      'inventory/sellpia-sync',
    );
    const methods = Object.getOwnPropertyNames(SellpiaInventoryImportController.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual(['importArtifact']);
    expect(Reflect.getMetadata('path', SellpiaInventoryImportController.prototype.importArtifact))
      .toBe('import');
    expect(Reflect.getMetadata('method', SellpiaInventoryImportController.prototype.importArtifact))
      .toBe(RequestMethod.POST);
  });

  it('rejects a missing inventory artifact with HTTP 400', () => {
    const controller = new SellpiaInventoryImportController(makePort());

    expect(() => controller.importArtifact(
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      browserDto(),
      undefined,
    )).toThrow(BadRequestException);
  });

  it('passes raw bytes, MIME, filename, browser execution, and authenticated scope', async () => {
    const port = makePort();
    const controller = new SellpiaInventoryImportController(port);
    const buffer = Buffer.from('{"source":"sellpia_product_search"}');

    await controller.importArtifact(
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      browserDto(),
      {
        buffer,
        originalname: 'sellpia-inventory-snapshot-v1.json',
        mimetype: 'application/json',
      },
    );

    expect(port.importInventory).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      file: {
        buffer,
        fileName: 'sellpia-inventory-snapshot-v1.json',
        mimeType: 'application/json',
      },
      execution: {
        kind: 'browser',
        claimToken: CLAIM_TOKEN,
        activeGeneration: '7',
        trigger: 'ttl_expired',
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      },
    });
  });

  it('passes an explicitly attested manual execution without browser fields', async () => {
    const port = makePort();
    const controller = new SellpiaInventoryImportController(port);

    await controller.importArtifact(
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      Object.assign(new SellpiaInventoryImportDto(), {
        kind: 'manual' as const,
        manualFreshExportConfirmed: true as const,
      }),
      {
        buffer: Buffer.from('상품코드,재고\nSP-1,1'),
        originalname: 'sellpia.csv',
        mimetype: 'text/csv',
      },
    );

    expect(port.importInventory).toHaveBeenCalledWith(expect.objectContaining({
      execution: { kind: 'manual', manualFreshExportConfirmed: true },
    }));
  });

  it('validates browser multipart strings and rejects malformed claim metadata', async () => {
    const valid = plainToInstance(SellpiaInventoryImportDto, {
      kind: 'browser',
      claimToken: CLAIM_TOKEN,
      activeGeneration: '9007199254740993',
      trigger: 'purchase_preflight',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
    });
    expect(await validate(valid)).toEqual([]);

    const invalid = plainToInstance(SellpiaInventoryImportDto, {
      kind: 'browser',
      claimToken: 'not-a-uuid',
      activeGeneration: '-1',
      trigger: 'unknown',
      sourceOrigin: 'https://evil.example',
      sourceAccountKey: 'other',
    });
    expect(await validate(invalid)).not.toEqual([]);
  });

  it('transforms only the manual string literal true to boolean true', async () => {
    const valid = plainToInstance(SellpiaInventoryImportDto, {
      kind: 'manual',
      manualFreshExportConfirmed: 'true',
    });
    expect(valid.manualFreshExportConfirmed).toBe(true);
    expect(await validate(valid)).toEqual([]);

    const invalid = plainToInstance(SellpiaInventoryImportDto, {
      kind: 'manual',
      manualFreshExportConfirmed: 'false',
    });
    expect(await validate(invalid)).not.toEqual([]);
  });

  it('caps the multer file interceptor at 10 MiB', () => {
    const source = readFileSync(__filename.replace(/\.spec\.ts$/, '.ts'), 'utf8');
    expect(source).toContain("FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })");
  });
});

function browserDto(): SellpiaInventoryImportDto {
  return Object.assign(new SellpiaInventoryImportDto(), {
    kind: 'browser' as const,
    claimToken: CLAIM_TOKEN,
    activeGeneration: '7',
    trigger: 'ttl_expired' as const,
    sourceOrigin: 'https://kiditem.sellpia.com' as const,
    sourceAccountKey: 'kiditem' as const,
  });
}

function makePort() {
  return {
    importInventory: vi
      .fn<SellpiaInventoryImportPort['importInventory']>()
      .mockResolvedValue({} as never),
  };
}
