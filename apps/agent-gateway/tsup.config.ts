import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  loader: { '.md': 'text' },
  noExternal: ['@kiditem/shared', 'zod'],
  external: ['@anthropic-ai/claude-code', '@openai/codex'],
});
