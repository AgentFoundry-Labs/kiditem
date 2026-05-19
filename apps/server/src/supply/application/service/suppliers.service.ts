import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  SUPPLIER_REPOSITORY_PORT,
  type SupplierCreateCommand,
  type SupplierRepositoryPort,
  type SupplierUpdateCommand,
} from '../port/out/supplier.repository.port';

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY_PORT)
    private readonly suppliers: SupplierRepositoryPort,
  ) {}

  async findAll(organizationId: string) {
    return this.suppliers.listWithCounts(organizationId);
  }

  async create(organizationId: string, command: SupplierCreateCommand) {
    return this.suppliers.create(organizationId, command);
  }

  async update(id: string, organizationId: string, command: SupplierUpdateCommand) {
    const updated = await this.suppliers.updateScoped(id, organizationId, command);
    if (!updated) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }

    return updated;
  }

  async delete(id: string, organizationId: string) {
    const deleted = await this.suppliers.deleteScoped(id, organizationId);
    if (!deleted) {
      throw new BadRequestException('거래처를 찾을 수 없습니다');
    }
    return { ok: true };
  }
}
