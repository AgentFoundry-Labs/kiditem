import { defineConfig } from 'vitest/config';

// 확장 TypeScript 소스(src/)의 단위 테스트. 옛 JS 테스트는 extensions/tests/ 에서
// node --test 로 돈다. `chrome` 전역은 없으므로 스펙이 필요한 만큼 스텁한다.
//   npm run extension:test
export default defineConfig({
  test: {
    name: 'extension',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
