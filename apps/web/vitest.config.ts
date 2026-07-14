import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const sharedRoot = path.resolve(__dirname, '../../packages/shared')
const sharedPackageJson = JSON.parse(
  fs.readFileSync(path.join(sharedRoot, 'package.json'), 'utf8'),
) as {
  exports: Record<string, null | { import?: string }>
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createSharedAliases() {
  return Object.entries(sharedPackageJson.exports)
    .flatMap(([subpath, target]) => {
      if (!target?.import || subpath.includes('*')) return []

      const importName = subpath === '.' ? '@kiditem/shared' : `@kiditem/shared/${subpath.slice(2)}`
      const sourcePath = target.import
        .replace(/^\.\/dist\//, '')
        .replace(/\.js$/, '.ts')

      return [{
        find: new RegExp(`^${escapeRegExp(importName)}$`),
        replacement: path.join(sharedRoot, 'src', sourcePath),
      }]
    })
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    execArgv: ['--no-experimental-webstorage'],
    globals: true,
    css: false,
  },
  resolve: {
    alias: [
      ...createSharedAliases(),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
})
