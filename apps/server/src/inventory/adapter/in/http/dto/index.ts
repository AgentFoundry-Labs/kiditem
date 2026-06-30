// Inventory + capability HTTP DTOs.
// organizationId is injected from `@CurrentOrganization()` — never accept it from
// `@Body()`/`@Query()`/`@Param()` and never declare a `organizationId` field on a
// request DTO.

// Inventory
export * from './list-inventory-query.dto';
export * from './update-inventory-metadata.dto';
export * from './receive-stock.dto';
export * from './issue-stock.dto';
export * from './adjust-stock.dto';
export * from './list-transactions-query.dto';
export * from './transaction-summary-query.dto';
export * from './sellpia-sync.dto';
export * from './rocket-inventory.dto';

// Unshipped
export * from './list-unshipped.dto';

// Warehouses
export { CreateWarehouseDto } from './create-warehouse.dto';
export { UpdateWarehouseDto } from './update-warehouse.dto';

// Stock transfers
export { ListStockTransfersQueryDto } from './list-stock-transfers.dto';
export { CreateStockTransferDto } from './create-stock-transfer.dto';
export { UpdateStockTransferDto } from './update-stock-transfer.dto';

// Stock audits
export { CreateStockAuditDto } from './create-stock-audit.dto';
export { UpdateStockAuditDto } from './update-stock-audit.dto';

// Picking
export { UpdatePickingItemDto } from './update-picking-item.dto';
