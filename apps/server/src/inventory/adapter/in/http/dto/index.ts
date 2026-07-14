// Inventory + capability HTTP DTOs.
// organizationId is injected from `@CurrentOrganization()` — never accept it from
// `@Body()`/`@Query()`/`@Param()` and never declare a `organizationId` field on a
// request DTO.

// Sellpia-owned inventory snapshot and receipt tracking
export * from './sellpia-receipt-batch.dto';
export * from './list-inventory-skus-query.dto';
export * from './list-sellpia-import-runs-query.dto';

// Unshipped
export * from './list-unshipped.dto';

// Warehouses
export { CreateWarehouseDto } from './create-warehouse.dto';
export { UpdateWarehouseDto } from './update-warehouse.dto';

// Stock transfers
export { ListStockTransfersQueryDto } from './list-stock-transfers.dto';
export { CreateStockTransferDto } from './create-stock-transfer.dto';
export { UpdateStockTransferDto } from './update-stock-transfer.dto';

// Picking
export { UpdatePickingItemDto } from './update-picking-item.dto';
