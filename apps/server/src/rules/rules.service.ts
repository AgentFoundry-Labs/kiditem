import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { compileRule, computeHealthScore } from './evaluator';
import { buildContext } from './build-context';
import { CompiledRule, EvaluationResult, ProductEvaluation } from './types';
import { SEED_RULES } from './seed-rules';

@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);
  private compiledRules: CompiledRule[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedRulesIfEmpty();
    await this.reloadRules();
  }

  async reloadRules(): Promise<{ count: number }> {
    const dbRules = await this.prisma.businessRule.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    this.compiledRules = dbRules.map(compileRule);
    this.logger.log(`Loaded ${this.compiledRules.length} rules`);
    return { count: this.compiledRules.length };
  }

  async evaluateAll(companyId: string): Promise<EvaluationResult> {
    if (!this.compiledRules.length) await this.reloadRules();

    const products = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false },
      include: {
        inventory: true,
        profitLoss: { take: 1, orderBy: [{ year: 'desc' }, { month: 'desc' }] },
        ads: { take: 1, orderBy: { date: 'desc' } },
        reviews: { select: { id: true } },
        thumbnails: { take: 1, orderBy: { measuredAt: 'desc' } },
      },
    });

    const results: ProductEvaluation[] = products.map((p) => {
      const ctx = buildContext(p);
      const violations = this.compiledRules
        .map((rule) => rule.evaluate(ctx))
        .filter((v) => v !== null);
      return {
        productId: p.id,
        violations,
        healthScore: computeHealthScore(violations),
      };
    });

    if (results.length > 0) {
      const cases = results
        .map((r) => `WHEN id = '${r.productId}'::uuid THEN ${r.healthScore}`)
        .join(' ');
      const ids = results.map((r) => `'${r.productId}'::uuid`).join(',');

      await this.prisma.$executeRawUnsafe(`
        UPDATE products
        SET health_score = CASE ${cases} END,
            health_updated_at = NOW()
        WHERE id IN (${ids})
      `);
    }

    const events = results.flatMap((r) =>
      r.violations.map((v) => ({
        companyId,
        objectType: 'product',
        objectId: r.productId,
        eventType: 'rule_violation',
        source: 'rules-engine',
        title: v.message,
        data: {
          ruleId: v.ruleId,
          severity: v.severity,
          category: v.category,
          actionType: v.actionType,
          value: v.value,
          threshold: v.threshold,
        },
      })),
    );
    if (events.length) {
      await this.prisma.activityEvent.createMany({ data: events });
    }

    const criticals = results.flatMap((r) =>
      r.violations
        .filter((v) => v.severity === 'critical')
        .map((v) => ({
          companyId,
          productId: r.productId,
          type: 'rule_violation',
          severity: 'critical',
          title: v.message,
          message: v.actionType ?? '',
        })),
    );
    if (criticals.length) {
      await this.prisma.alert.createMany({ data: criticals });
    }

    const violationCount = results.reduce((sum, r) => sum + r.violations.length, 0);

    this.logger.log(
      `Evaluated ${products.length} products, ${violationCount} violations`,
    );

    return {
      total: products.length,
      healthy: results.filter((r) => r.healthScore >= 70).length,
      warning: results.filter((r) => r.healthScore >= 40 && r.healthScore < 70).length,
      critical: results.filter((r) => r.healthScore < 40).length,
      violationCount,
      evaluatedAt: new Date(),
    };
  }

  async getSummary(companyId: string) {
    const [healthy, warning, critical, total, lastEval] = await Promise.all([
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 70 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 40, lt: 70 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { lt: 40 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false },
      }),
      this.prisma.product.findFirst({
        where: { companyId, isDeleted: false, healthUpdatedAt: { not: null } },
        orderBy: { healthUpdatedAt: 'desc' },
        select: { healthUpdatedAt: true },
      }),
    ]);

    const notEvaluated = total - healthy - warning - critical;

    const topCritical = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false, healthScore: { lt: 40 } },
      orderBy: { healthScore: 'asc' },
      take: 5,
      select: { id: true, name: true, healthScore: true, abcGrade: true },
    });

    return {
      total,
      healthy,
      warning,
      critical,
      notEvaluated,
      lastEvaluatedAt: lastEval?.healthUpdatedAt ?? null,
      topCritical,
    };
  }

  async findAllRules(companyId: string, category?: string) {
    return this.prisma.businessRule.findMany({
      where: {
        companyId,
        ...(category ? { category } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateRule(id: string, data: { threshold?: unknown; active?: boolean; autoExecute?: boolean }) {
    const updated = await this.prisma.businessRule.update({
      where: { id },
      data: {
        ...(data.threshold !== undefined ? { threshold: data.threshold as object } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.autoExecute !== undefined ? { autoExecute: data.autoExecute } : {}),
      },
    });
    await this.reloadRules();
    return updated;
  }

  private async seedRulesIfEmpty() {
    const firstCompany = await this.prisma.company.findFirst();
    if (!firstCompany) {
      this.logger.warn('No company found — skipping rule seed');
      return;
    }

    const existing = await this.prisma.businessRule.count({
      where: { companyId: firstCompany.id },
    });
    if (existing > 0) {
      this.logger.log(`${existing} rules already exist — skipping seed`);
      return;
    }

    const data = SEED_RULES.map((r) => ({
      ...r,
      companyId: firstCompany.id,
      threshold: r.threshold as object,
    }));

    await this.prisma.businessRule.createMany({ data });
    this.logger.log(`Seeded ${data.length} rules for company ${firstCompany.name}`);
  }
}
