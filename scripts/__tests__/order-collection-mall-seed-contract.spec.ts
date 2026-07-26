import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ORDER_COLLECTION_MALL_ENV } from "../../apps/server/src/orders/seed-order-collection-mall-accounts";

const repoRoot = join(__dirname, "..", "..");

describe("order-collection mall seed deployment contract", () => {
  it("documents every supported mall credential triple in the local example", () => {
    const example = readFileSync(
      join(repoRoot, "apps/server/.env.example"),
      "utf8",
    );

    for (const mall of ORDER_COLLECTION_MALL_ENV) {
      expect(example).toContain(`${mall.prefix}_ID=`);
      expect(example).toContain(`${mall.prefix}_PW=`);
      expect(example).toContain(`${mall.prefix}_URL=`);
    }
  });

  it("seeds only on normal staging deploys and keeps plaintext out of runtime rendering", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github/workflows/staging-deploy.yml"),
      "utf8",
    );
    const seedStep = workflow.match(
      /- name: Seed organization-scoped order collection mall accounts[\s\S]*?(?=\n      - name: Render staging runtime env files)/,
    )?.[0];

    expect(seedStep).toBeDefined();
    expect(seedStep).toContain("if: inputs.destructive_reset == ''");
    expect(seedStep).toContain(
      "secrets.STAGING_ORDER_COLLECTION_MALL_ACCOUNTS",
    );
    expect(seedStep).toContain(
      "vars.STAGING_ORDER_COLLECTION_MALL_ORGANIZATION_ID",
    );
    expect(seedStep).toContain("npm run seed:order-collection-malls");

    const renderStep = workflow.match(
      /- name: Render staging runtime env files[\s\S]*?bash deploy\/staging\/render-runtime-env\.sh/,
    )?.[0];
    expect(renderStep).toBeDefined();
    expect(renderStep).not.toContain("STAGING_ORDER_COLLECTION_MALL_ACCOUNTS");
    expect(renderStep).not.toContain("ORDER_COLLECTION_MALL_ACCOUNTS_ENV");
  });
});
