import type {
  WarehouseListItem,
  WarehouseRow,
} from '../out/warehouses.repository.port';

export const WAREHOUSES_PORT = Symbol('WarehousesPort');

export type CreateWarehouseInput = {
  name: string;
  code?: string;
  address?: string;
  manager?: string;
  phone?: string;
  isDefault?: boolean;
  status?: string;
};

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

export interface WarehousesPort {
  findAll(companyId: string): Promise<WarehouseListItem[]>;
  create(companyId: string, dto: CreateWarehouseInput): Promise<WarehouseRow>;
  update(id: string, companyId: string, dto: UpdateWarehouseInput): Promise<WarehouseRow>;
  delete(id: string, companyId: string): Promise<{ ok: true }>;
}
