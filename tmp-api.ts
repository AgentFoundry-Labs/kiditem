import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createTemporaryAuthSession, revokeTemporaryAuthSession } from './scripts/_shared/temporary-auth-session';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
(async () => {
  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, email: true } });
  const s = await createTemporaryAuthSession(prisma, { userId: user!.id, email: user!.email, lifetimeMs: 300000 });
  try {
    const r = await fetch('http://127.0.0.1:4188/api/ads/keywords?period=14d', {
      headers: { Authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(60000),
    });
    const d = JSON.parse(await r.text());
    const flagged = d.keywords.filter((k: { relevance: string | null }) => k.relevance === 'irrelevant');
    console.log('status', r.status, '| keywords', d.keywords.length, '| products', d.products.length);
    console.log('irrelevant flagged:', flagged.length);
    for (const k of flagged.slice(0, 5)) console.log(`  - ${k.keyword} :: ${k.relevanceReason?.slice(0, 70)}`);
    const p = d.products.find((x: { irrelevantCount: number }) => x.irrelevantCount > 0);
    console.log('product rollup:', p ? `${p.productName} → 키워드 ${p.keywordCount} / 연관없음 ${p.irrelevantCount} / 미판정 ${p.unjudgedCount}` : 'none');
  } finally { await revokeTemporaryAuthSession(prisma, s.id); await prisma.$disconnect(); }
})();
