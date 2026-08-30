import path from 'node:path';
import { describe, expect, it } from 'vitest';
import integrationConfig from '../../vitest.config.integration';
import unitConfig from '../../vitest.config';

const sharedSource = path.resolve(__dirname, '../../../../packages/shared/src');
const agentRuntimeSpecifier = '@kiditem/shared/agent-runtime';
const expectedAgentRuntimeEntry = path.resolve(
  sharedSource,
  'agent-runtime/index.ts',
);

type Alias = {
  find: string | RegExp;
  replacement: string;
};

function aliasesFor(config: typeof unitConfig): Alias[] {
  const aliases = config.resolve?.alias;
  expect(aliases).toBeInstanceOf(Array);
  return aliases as Alias[];
}

function matchingAliasIndex(aliases: Alias[], specifier: string): number {
  return aliases.findIndex(({ find }) =>
    typeof find === 'string' ? find === specifier : find.test(specifier),
  );
}

describe('Vitest shared-subpath aliases', () => {
  it('resolves agent-runtime to its directory entry before the generic shared fallback in every server config', () => {
    for (const config of [unitConfig, integrationConfig]) {
      const aliases = aliasesFor(config);
      const focusedIndex = matchingAliasIndex(aliases, agentRuntimeSpecifier);
      const genericIndex = aliases.findIndex(
        ({ find }) => find instanceof RegExp && find.source === '^@kiditem\\/shared\\/([^/]+)$',
      );

      expect(focusedIndex).toBeGreaterThanOrEqual(0);
      expect(aliases[focusedIndex]?.replacement).toBe(expectedAgentRuntimeEntry);
      expect(genericIndex).toBeGreaterThan(focusedIndex);
    }
  });
});
