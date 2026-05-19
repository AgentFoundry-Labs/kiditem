// SystemSetting-backed advertising config storage. AdConfigService composes
// defaults + validation over this adapter so business rules stay in the
// application layer and Prisma stays out.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdConfigRepositoryPort,
  AdConfigSettingRow,
} from '../../../application/port/out/repository/ad-config.repository.port';

@Injectable()
export class AdConfigRepositoryAdapter implements AdConfigRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAdSettings(organizationId: string): Promise<AdConfigSettingRow[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { organizationId, key: { startsWith: 'ads.' } },
    });
    return rows.map((row) => ({ key: row.key, value: row.value }));
  }

  async upsertSetting(
    key: string,
    value: unknown,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: { value: JSON.stringify(value) },
      create: { organizationId, key, value: JSON.stringify(value) },
    });
  }

  async seedDefaults(
    defaults: Record<string, unknown>,
    organizationId: string,
  ): Promise<number> {
    const existing = await this.prisma.systemSetting.findFirst({
      where: { organizationId, key: { startsWith: 'ads.' } },
    });
    if (existing) return 0;
    const result = await this.prisma.systemSetting.createMany({
      data: Object.entries(defaults).map(([key, value]) => ({
        organizationId,
        key,
        value: JSON.stringify(value),
      })),
      skipDuplicates: true,
    });
    return result.count;
  }
}
