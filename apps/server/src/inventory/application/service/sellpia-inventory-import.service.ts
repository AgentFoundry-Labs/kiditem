import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  type ImportSellpiaInventoryInput,
  type SellpiaInventoryImportPort,
} from '../port/in/stock/sellpia-inventory-import.port';
import {
  INVENTORY_SKU_IMPORT_REPOSITORY_PORT,
  type InventorySkuImportRepositoryPort,
} from '../port/out/repository/inventory-sku-import.repository.port';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';

@Injectable()
export class SellpiaInventoryImportService implements SellpiaInventoryImportPort {
  constructor(
    @Inject(INVENTORY_SKU_IMPORT_REPOSITORY_PORT)
    private readonly repository: InventorySkuImportRepositoryPort,
  ) {}

  async importInventory(
    input: ImportSellpiaInventoryInput,
  ): Promise<SellpiaInventoryImportResponse> {
    const claim = await this.repository.claimSellpiaImport({
      organizationId: input.organizationId,
      userId: input.userId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      rowCount: input.rows.length,
    });

    if (claim.kind === 'duplicate') return claim.response;
    if (claim.kind === 'running') {
      throw new ConflictException('This Sellpia inventory file is already being imported');
    }

    try {
      return await this.repository.replaceSellpiaSnapshot({
        organizationId: input.organizationId,
        runId: claim.runId,
        attemptToken: claim.attemptToken,
        rows: input.rows,
      });
    } catch (error) {
      try {
        await this.repository.markImportFailed(
          input.organizationId,
          claim.runId,
          claim.attemptToken,
        );
      } catch {
        // A reclaimed or completed run owns the state now. Preserve the import failure.
      }
      throw error;
    }
  }
}
