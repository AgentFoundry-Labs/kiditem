import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// Architecture guard tests freeze the Inventory port/adapter contract:
//
//   - PrismaService is imported only under `inventory/adapter/out/repository/**`.
//   - `*persistence.ts` is not used as final naming under `apps/server/src/inventory`.
//   - `application/**` does not import Prisma client/types.
//   - `application/service/**` does not import `adapter/out/**` or products
//     implementation details. Concrete adapters reach application code only
//     via Nest token bindings to ports.
//   - Controllers (`adapter/in/http/**`) depend on `application/port/in/**`,
//     not on concrete application services.
//   - Domain code (`inventory/domain/**`) does not depend on NestJS, Prisma,
//     PrismaService, HTTP DTO classes, or any incoming-adapter module.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INVENTORY_ROOT = path.resolve(__dirname, '..');
const PRISMA_INVENTORY_SCHEMA = path.resolve(REPO_ROOT, 'prisma/models/inventory.prisma');

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function inventoryRel(): string {
  return path.relative(REPO_ROOT, INVENTORY_ROOT);
}

describe('Inventory architecture contract', () => {
  it('uses Sellpia MasterProduct as the sole operational inventory identity', () => {
    const schema = readFileSync(PRISMA_INVENTORY_SCHEMA, 'utf8');
    for (const modelName of ['StockTransfer', 'PickingItem', 'ReturnTransfer']) {
      const block = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
      expect(block, `${modelName} must carry masterProductId`).toContain('masterProductId');
      expect(block, `${modelName} must relate to MasterProduct`).toContain('MasterProduct');
      expect(block).not.toContain('inventorySkuId');
      expect(block).not.toMatch(/\boptionId\b/);
    }
  });

  it('persists organization-scoped idempotent Sellpia order transmission intents', () => {
    const schema = readFileSync(PRISMA_INVENTORY_SCHEMA, 'utf8');
    const block = schema.match(
      /model SellpiaOrderTransmissionIntent \{([\s\S]*?)\n\}/,
    )?.[1] ?? '';

    expect(block).toContain('organizationId');
    expect(block).toContain('intentKey');
    expect(block).toContain('status');
    expect(block).toContain('finalizedGeneration');
    expect(block).toContain('@@unique([organizationId, intentKey]');
    expect(block).toContain('@@index([organizationId, status]');
    expect(schema).not.toMatch(/^enum\s+/m);
  });

  it('keeps Unshipped reads behind a dedicated repository adapter', () => {
    const service = readFileSync(
      path.join(INVENTORY_ROOT, 'application/service/unshipped.service.ts'),
      'utf8',
    );
    expect(service).toContain('UNSHIPPED_REPOSITORY_PORT');
    expect(service).not.toContain('INVENTORY_QUERY_REPOSITORY_PORT');
  });

  it('PrismaService is imported only under inventory/adapter/out/repository/**', () => {
    const inv = inventoryRel();
    const allowedPrefix = path.join(inv, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${inv} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no *persistence.ts files survive under apps/server/src/inventory', () => {
    const inv = inventoryRel();
    const hits = rg(
      `--type ts --files --glob '${path.join(inv, '**', '*persistence.ts')}'`,
    );
    expect(
      hits,
      `\`*persistence.ts\` is migration-waypoint naming only — switch to repository adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const inv = inventoryRel();
    const applicationGlob = path.join(inv, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const inv = inventoryRel();
    const serviceGlob = path.join(inv, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import products module/services directly', () => {
    const inv = inventoryRel();
    const serviceGlob = path.join(inv, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'ProductsModule|BundleStockService|products/application|products/adapter|products/domain' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must not depend on products implementation details:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('adapter/in/http/** controllers depend on application/port/in/**, not concrete services', () => {
    const inv = inventoryRel();
    const httpGlob = path.join(inv, 'adapter/in/http') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/service/' --glob '${httpGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `controllers must inject application/port/in/* tokens, not concrete services:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const inv = inventoryRel();
    const domainGlob = path.join(inv, 'domain') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@nestjs|@prisma/client|PrismaService|adapter/in/http|\\.dto'\
       --glob '${domainGlob}' --glob '!**/__tests__/**'`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });
});
