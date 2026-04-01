import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureGateService {
  private readonly logger = new Logger(FeatureGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(name: string, companyId?: string): Promise<boolean> {
    const gate = await this.prisma.featureGate.findUnique({ where: { name } });
    if (!gate) return true; // 게이트 없으면 기본 허용
    if (!gate.enabled) return false;
    if (gate.allowedCompanies.length === 0) return true; // 빈 배열 = 전체 허용
    if (!companyId) return false;
    return gate.allowedCompanies.includes(companyId);
  }

  async list() {
    return this.prisma.featureGate.findMany({ orderBy: { name: 'asc' } });
  }

  async upsert(
    name: string,
    data: {
      enabled?: boolean;
      description?: string;
      allowedCompanies?: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.featureGate.upsert({
      where: { name },
      update: data as any,
      create: { name, ...data } as any,
    });
  }

  async delete(name: string) {
    await this.prisma.featureGate.delete({ where: { name } });
    return { ok: true };
  }
}
