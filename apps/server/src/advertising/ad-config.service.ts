import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AdsConfig {
  roas: { thresholds: { excellent: number; warning: number; poor: number } };
  adRate: { thresholds: { warning: number; critical: number } };
  budget: { allocation: Record<string, number> };
  roasTargetByGrade: Record<string, number>;
  adRateTargetByGrade: Record<string, number>;
  tier: { dailyBudget: Record<string, number> };
  benchmark: {
    roas: { avg: number; good: number; excellent: number; poor: number };
    ctr: { avg: number; good: number; excellent: number; poor: number };
    cvr: { avg: number; good: number; excellent: number; poor: number };
    cpc: { avg: number; good: number; excellent: number; poor: number };
    adRate: { avg: number; good: number; excellent: number; poor: number };
    acos: { avg: number; good: number; excellent: number; poor: number };
  };
  gradeStrategy: Record<string, { title: string; subtitle: string; pills: string[]; budgetTarget: number; roasTarget: number; adRateTarget: number }>;
}

const DEFAULTS: Record<string, unknown> = {
  'ads.roas.thresholds': { excellent: 300, warning: 200, poor: 100 },
  'ads.adRate.thresholds': { warning: 15, critical: 20 },
  'ads.budget.allocation': { A: 60, B: 30, C: 10 },
  'ads.roas.targetByGrade': { A: 300, B: 400, C: 500 },
  'ads.adRate.targetByGrade': { A: 12, B: 8, C: 5 },
  'ads.tier.dailyBudget': { '1차': 150000, '2차': 100000, '3차': 50000 },
  'ads.benchmark.roas': { avg: 350, good: 500, excellent: 700, poor: 200 },
  'ads.benchmark.ctr': { avg: 0.3, good: 0.5, excellent: 1.0, poor: 0.15 },
  'ads.benchmark.cvr': { avg: 8, good: 12, excellent: 15, poor: 5 },
  'ads.benchmark.cpc': { avg: 250, good: 150, excellent: 100, poor: 500 },
  'ads.benchmark.adRate': { avg: 15, good: 10, excellent: 5, poor: 25 },
  'ads.benchmark.acos': { avg: 25, good: 15, excellent: 10, poor: 40 },
  'ads.grade.A.strategy': {
    title: '핵심 상품', subtitle: '공격 확장',
    pills: ['예산 증액', '키워드 확장', '입찰가 인상'],
    budgetTarget: 60, roasTarget: 300, adRateTarget: 12,
  },
  'ads.grade.B.strategy': {
    title: '성장 후보', subtitle: '최적화 집중',
    pills: ['효율 개선', '키워드 정리', '입찰 조정'],
    budgetTarget: 30, roasTarget: 400, adRateTarget: 8,
  },
  'ads.grade.C.strategy': {
    title: '정리 대상', subtitle: '손절·재구성',
    pills: ['예산 축소', '중단 검토', '구조 개편'],
    budgetTarget: 10, roasTarget: 500, adRateTarget: 5,
  },
};

@Injectable()
export class AdConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) throw new InternalServerErrorException('회사 정보를 찾을 수 없습니다');
    return company.id;
  }

  async getConfig(companyId?: string): Promise<AdsConfig> {
    const cid = companyId || await this.getDefaultCompanyId();

    const settings = await this.prisma.systemSetting.findMany({
      where: { companyId: cid, key: { startsWith: 'ads.' } },
    });

    // seed if empty
    if (settings.length === 0) {
      await this.seedDefaults(cid);
      return this.getConfig(cid);
    }

    const map = new Map<string, unknown>();
    for (const s of settings) {
      map.set(s.key, JSON.parse(s.value));
    }

    const get = <T>(key: string): T => (map.get(key) ?? DEFAULTS[key]) as T;

    return {
      roas: { thresholds: get('ads.roas.thresholds') },
      adRate: { thresholds: get('ads.adRate.thresholds') },
      budget: { allocation: get('ads.budget.allocation') },
      roasTargetByGrade: get('ads.roas.targetByGrade'),
      adRateTargetByGrade: get('ads.adRate.targetByGrade'),
      tier: { dailyBudget: get('ads.tier.dailyBudget') },
      benchmark: {
        roas: get('ads.benchmark.roas'),
        ctr: get('ads.benchmark.ctr'),
        cvr: get('ads.benchmark.cvr'),
        cpc: get('ads.benchmark.cpc'),
        adRate: get('ads.benchmark.adRate'),
        acos: get('ads.benchmark.acos'),
      },
      gradeStrategy: {
        A: get('ads.grade.A.strategy'),
        B: get('ads.grade.B.strategy'),
        C: get('ads.grade.C.strategy'),
      },
    };
  }

  async updateConfig(companyId: string | undefined, key: string, value: unknown): Promise<void> {
    const cid = companyId || await this.getDefaultCompanyId();

    if (!key.startsWith('ads.') || !(key in DEFAULTS)) {
      throw new NotFoundException(`알 수 없는 설정 키: ${key}`);
    }

    await this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: cid, key } },
      update: { value: JSON.stringify(value) },
      create: { companyId: cid, key, value: JSON.stringify(value) },
    });
  }

  async seedDefaults(companyId: string): Promise<number> {
    const existing = await this.prisma.systemSetting.findFirst({
      where: { companyId, key: { startsWith: 'ads.' } },
    });
    if (existing) return 0;

    const result = await this.prisma.systemSetting.createMany({
      data: Object.entries(DEFAULTS).map(([key, value]) => ({
        companyId,
        key,
        value: JSON.stringify(value),
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async seedDefaultsForDefaultCompany(): Promise<number> {
    const companyId = await this.getDefaultCompanyId();
    return this.seedDefaults(companyId);
  }
}
