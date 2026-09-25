import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 확장 TypeScript 소스(src/)의 단위 테스트. 옛 JS 테스트는 extensions/tests/ 에서
// node --test 로 돈다. `chrome` 전역은 없으므로 스펙이 필요한 만큼 스텁한다.
// `@kiditem/shared/*` 는 tsconfig paths·번들과 같이 packages/shared/src 소스를 본다.
//   npm run extension:test
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@kiditem\/shared\/(.*)$/,
        replacement: fileURLToPath(new URL('../packages/shared/src/$1.ts', import.meta.url)),
      },
    ],
  },
  test: {
    name: 'extension',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
