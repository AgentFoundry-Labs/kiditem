/**
 * Prisma seed script — 에이전트 정의 초기 등록.
 * 실행: npx prisma db seed
 * 또는: npx tsx prisma/seed.ts
 *
 * 이미 존재하는 에이전트는 skip (upsert 아님).
 * 프로덕션에서 에이전트 수정은 API로.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const configDir = path.join(process.cwd(), 'agent-config');
  const defsPath = path.join(configDir, 'definitions.json');

  if (!fs.existsSync(defsPath)) {
    console.log('No agent-config/definitions.json found, skipping seed.');
    return;
  }

  const defs = JSON.parse(fs.readFileSync(defsPath, 'utf-8'));

  for (const def of defs) {
    // Load prompt from file
    if (def.promptFile) {
      const promptPath = path.join(process.cwd(), def.promptFile);
      if (fs.existsSync(promptPath)) {
        def.promptTemplate = fs.readFileSync(promptPath, 'utf-8');
      } else {
        console.warn(`Prompt file not found: ${promptPath}, skipping ${def.type}`);
        continue;
      }
      delete def.promptFile;
    }

    const existing = await prisma.agentDefinition.findUnique({
      where: { type: def.type },
    });

    if (!existing) {
      await prisma.agentDefinition.create({ data: def });
      console.log(`Seeded: ${def.name} (${def.type})`);
    } else {
      console.log(`Exists: ${def.name} (${def.type}) — skip`);
    }
  }
}

main()
  .then(() => console.log('Seed complete.'))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
