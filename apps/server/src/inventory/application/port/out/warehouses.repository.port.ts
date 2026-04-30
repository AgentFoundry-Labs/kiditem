export const WAREHOUSES_REPOSITORY_PORT = Symbol('WarehousesRepositoryPort');

export type WarehouseRow = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  address: string | null;
  manager: string | null;
  phone: string | null;
  isDefault: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};
export type WarehouseListItem = WarehouseRow & { shipmentCount: number };

export type CreateWarehouseData = {
  name: string;
  code?: string;
  address?: string;
  manager?: string;
  phone?: string;
  isDefault?: boolean;
  status?: string;
};

export type WarehouseUpdateData = Partial<CreateWarehouseData>;

export interface WarehousesRepositoryPort {
  listWarehouses(companyId: string): Promise<WarehouseListItem[]>;
  findWarehouseById(id: string, companyId: string): Promise<WarehouseRow | null>;
  createWarehouse(companyId: string, data: CreateWarehouseData): Promise<WarehouseRow>;
  updateWarehouse(id: string, data: WarehouseUpdateData): Promise<WarehouseRow>;
  deleteWarehouse(id: string): Promise<void>;
}
