import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { compileRule, computeHealthScore, deduplicateByField } from './evaluator';
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
      const allViolations = this.compiledRules
        .map((rule) => rule.evaluate(ctx))
        .filter((v) => v !== null);
      const violations = deduplicateByField(allViolations);
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

  async suggestThresholds(companyId: string) {
    const queries: Record<string, string> = {
      profitRate: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY pl.profit_rate * 100) as pcts
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE p.company_id = '${companyId}' AND p.is_deleted = false
        AND pl.profit_rate IS NOT NULL
      `,
      adRate: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY CASE WHEN pl.revenue > 0 THEN (pl.ad_cost::float / pl.revenue * 100) ELSE 0 END) as pcts
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE p.company_id = '${companyId}' AND p.is_deleted = false
        AND pl.revenue > 0
      `,
      currentStock: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY i.current_stock) as pcts
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE p.company_id = '${companyId}' AND p.is_deleted = false
      `,
      thumbnailCTR: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY t.ctr * 100) as pcts
        FROM thumbnails t
        JOIN products p ON p.id = t.product_id
        WHERE p.company_id = '${companyId}' AND p.is_deleted = false
        AND t.ctr IS NOT NULL
        AND t.measured_at = (SELECT MAX(t2.measured_at) FROM thumbnails t2 WHERE t2.product_id = t.product_id)
      `,
      reviewCount: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY cnt) as pcts
        FROM (
          SELECT p.id, count(r.id) as cnt
          FROM products p
          LEFT JOIN reviews r ON r.product_id = p.id
          WHERE p.company_id = '${companyId}' AND p.is_deleted = false
          GROUP BY p.id
        ) sub
      `,
      orderCount: `
        SELECT percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) WITHIN GROUP (ORDER BY pl.order_count) as pcts
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE p.company_id = '${companyId}' AND p.is_deleted = false
        AND pl.order_count IS NOT NULL
      `,
    };

    const results: Record<string, { p10: number; p25: number; p50: number; p75: number; p90: number }> = {};

    for (const [field, sql] of Object.entries(queries)) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ pcts: number[] }>>(sql);
        if (rows.length > 0 && rows[0].pcts) {
          const p = rows[0].pcts.map((v: number) => Math.round(v * 10) / 10);
          results[field] = { p10: p[0], p25: p[1], p50: p[2], p75: p[3], p90: p[4] };
        }
      } catch {
        this.logger.warn(`Failed to compute percentiles for ${field}`);
      }
    }

    const rules = await this.prisma.businessRule.findMany({
      where: { companyId, active: true, conditions: { equals: Prisma.DbNull } },
      select: { id: true, field: true, operator: true, threshold: true, displayName: true, severity: true },
    });

    const suggestions = rules
      .filter((r) => results[r.field])
      .map((r) => {
        const dist = results[r.field];
        const current = (r.threshold as { value?: number })?.value;
        const suggested = r.severity === 'critical' ? dist.p10
          : r.severity === 'warning' ? dist.p25
          : dist.p50;
        return {
          ruleId: r.id,
          displayName: r.displayName,
          field: r.field,
          severity: r.severity,
          currentThreshold: current ?? null,
          suggestedThreshold: suggested,
          distribution: dist,
        };
      });

    return { distributions: results, suggestions };
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
