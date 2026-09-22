// Inventory + capability HTTP DTOs.
// organizationId is injected from `@CurrentOrganization()` — never accept it from
// `@Body()`/`@Query()`/`@Param()` and never declare a `organizationId` field on a
// request DTO.

// Warehouses
export { CreateWarehouseDto } from './create-warehouse.dto';
export { UpdateWarehouseDto } from './update-warehouse.dto';

// Stock transfers
export { ListStockTransfersQueryDto } from './list-stock-transfers.dto';
export { CreateStockTransferDto } from './create-stock-transfer.dto';
