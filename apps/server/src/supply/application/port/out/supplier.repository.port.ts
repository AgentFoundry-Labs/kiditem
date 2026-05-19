export const SUPPLIER_REPOSITORY_PORT = Symbol('SUPPLIER_REPOSITORY_PORT');

export type SupplierCreateCommand = {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  leadTimeDays?: number;
  paymentTerms?: string;
  notes?: string;
};

export type SupplierUpdateCommand = Partial<SupplierCreateCommand> & {
  status?: string;
};

export type SupplierRecord = {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  leadTimeDays: number;
  paymentTerms: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SupplierListItem = SupplierRecord & {
  productCount: number;
  orderCount: number;
};

export interface SupplierRepositoryPort {
  listWithCounts(organizationId: string): Promise<SupplierListItem[]>;
  create(organizationId: string, command: SupplierCreateCommand): Promise<SupplierRecord>;
  updateScoped(
    id: string,
    organizationId: string,
    command: SupplierUpdateCommand,
  ): Promise<SupplierRecord | null>;
  deleteScoped(id: string, organizationId: string): Promise<boolean>;
}
