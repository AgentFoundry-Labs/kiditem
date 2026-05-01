import { defineConfig } from 'vitest/config';
import path from 'path';

const sharedSrc = path.resolve(__dirname, '../../packages/shared/src');

/**
 * Integration test config — real Postgres 기반.
 *
 * - `docker-compose.test.yml` 로 띄운 격리 Postgres(5434) 를 대상으로 한다.
 * - 파일명 규칙: `**\/*.pg.integration.spec.ts` — unit(vitest.config.ts) / e2e(vitest.config.e2e.ts) 와 구분.
 * - 루트에서 `npm run test:integration` 으로 실행 (DATABASE_URL 주입 + root 고정).
 *
 * 실행 전 필요:
 *   npm run db:test:up         # Postgres tmpfs 기동
 *   npm run db:test:prepare    # prisma db push (schema)
 *
 * 단일 fork 로 serial 실행:
 *   - TRUNCATE CASCADE 기반 reset 은 트랜잭션 중첩에 취약 → singleFork 로 격리 단순화
 *   - race 테스트는 Promise.all 병렬이지만 테스트 파일 자체는 순차 실행
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@kiditem\/shared$/, replacement: path.resolve(sharedSrc, 'index.ts') },
      { find: /^@kiditem\/shared\/errors$/, replacement: path.resolve(sharedSrc, 'errors/index.ts') },
      { find: /^@kiditem\/shared\/security$/, replacement: path.resolve(sharedSrc, 'security/index.ts') },
      { find: /^@kiditem\/shared\/panel$/, replacement: path.resolve(sharedSrc, 'panel/index.ts') },
      { find: /^@kiditem\/shared\/([^/]+)$/, replacement: path.resolve(sharedSrc, '$1.ts') },
    ],
  },
  test: {
    root: '.',
    include: [
      'src/**/*.pg.integration.spec.ts',
      'src/**/__tests__/*.pg.integration.spec.ts',
    ],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    // vitest v4: poolOptions 제거, isolate=false 로 동일 fork 재사용
    isolate: false,
    fileParallelism: false,
  },
});
