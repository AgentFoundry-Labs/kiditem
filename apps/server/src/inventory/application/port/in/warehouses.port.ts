import type {
  WarehouseListItem,
  WarehouseRow,
} from '../out/repository/warehouses.repository.port';

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
  findAll(organizationId: string): Promise<WarehouseListItem[]>;
  create(organizationId: string, dto: CreateWarehouseInput): Promise<WarehouseRow>;
  update(id: string, organizationId: string, dto: UpdateWarehouseInput): Promise<WarehouseRow>;
  delete(id: string, organizationId: string): Promise<{ ok: true }>;
}
