import { defineConfig } from 'vitest/config';
import path from 'path';

const sharedSrc = path.resolve(__dirname, '../../packages/shared/src');

/**
 * Integration test config — real Postgres 기반.
 *
 * - Testcontainers 가 invocation 당 격리된 Postgres 17 컨테이너를 하나 기동한다.
 * - 파일명 규칙: `**\/*.pg.integration.spec.ts` — unit(vitest.config.ts) / e2e(vitest.config.e2e.ts) 와 구분.
 * - global setup 이 동적 DATABASE_URL 로 Prisma schema 를 push 한 뒤 worker 에 전달한다.
 * - 루트에서 `npm run test:integration` 한 번으로 실행하고 종료 시 자동 정리한다.
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
      { find: /^@kiditem\/shared\/product$/, replacement: path.resolve(sharedSrc, 'product/index.ts') },
      { find: /^@kiditem\/shared\/sourcing$/, replacement: path.resolve(sharedSrc, 'sourcing/index.ts') },
      { find: /^@kiditem\/shared\/([^/]+)$/, replacement: path.resolve(sharedSrc, '$1.ts') },
    ],
  },
  test: {
    root: '.',
    globalSetup: './src/test-helpers/postgres-global-setup.ts',
    setupFiles: ['./src/test-helpers/postgres-test-env.setup.ts'],
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
