import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const AI_ROOT = resolve(import.meta.dirname, '..');
const SERVER_ROOT = resolve(AI_ROOT, '..');

const LEGACY_FILES = [
  'adapter/in/http/content-workspace-attachment.controller.ts',
  'adapter/out/products/master-catalog.adapter.ts',
  'adapter/out/repository/content-workspace-attachment.repository.adapter.ts',
  'adapter/out/repository/post-promotion-generation.repository.adapter.ts',
  'adapter/out/repository/product-workspace-group.repository.adapter.ts',
  'application/port/in/generation/post-promotion-ai-trigger.port.ts',
  'application/port/out/cross-domain/master-catalog.port.ts',
  'application/port/out/repository/content-workspace-attachment.repository.port.ts',
  'application/port/out/repository/post-promotion-generation.repository.port.ts',
  'application/port/out/repository/product-workspace-group.repository.port.ts',
  'application/service/content-workspace-attachment.service.ts',
  'application/service/post-promotion-ai.service.ts',
] as const;

/**
 * KID-310: Sourcing no longer owns a content workspace, so its one-to-one
 * forwarding port/adapter pairs onto the AI capability are gone. Callers use
 * the AI incoming port directly (ADR-0021).
 */
const RETIRED_SOURCING_PASS_THROUGHS = [
  'sourcing/adapter/out/ai/candidate-content-asset.adapter.ts',
  'sourcing/adapter/out/ai/registration-content-workspace.adapter.ts',
  'sourcing/adapter/out/ai/workspace-archive.adapter.ts',
  'sourcing/application/port/out/cross-domain/candidate-content-asset.port.ts',
  'sourcing/application/port/out/cross-domain/ai-workspace-archive.port.ts',
] as const;

describe('AI final workspace-owner cutover', () => {
  it('keeps no Sourcing pass-through in front of the AI workspace capability', () => {
    expect(RETIRED_SOURCING_PASS_THROUGHS.filter((file) => existsSync(resolve(SERVER_ROOT, file))))
      .toEqual([]);
  });

  /**
   * One owner publishes one capability (ADR-0021). A second declaration of this
   * symbol means a forwarding port grew back in front of the AI one.
   */
  it('declares the registration workspace port exactly once in the server', () => {
    const declarations = execFileSync('git', [
      'grep', '-l', '--', 'export const REGISTRATION_CONTENT_WORKSPACE_PORT', '--', 'apps/server/src',
    ], { cwd: resolve(SERVER_ROOT, '../../..'), encoding: 'utf8' })
      .split('\n')
      .filter((file) => file && !file.endsWith('.spec.ts'));

    expect(declarations).toEqual([
      'apps/server/src/content/application/port/in/workspace/registration-content-workspace.port.ts',
    ]);
  });

  it('owns the workspace ports under sales-product names', () => {
    expect(existsSync(resolve(AI_ROOT, 'application/port/in/workspace/sales-product-content-asset.port.ts'))).toBe(true);
    expect(existsSync(resolve(AI_ROOT, 'application/port/in/workspace/sales-product-workspace-archive.port.ts'))).toBe(true);
    expect(existsSync(resolve(AI_ROOT, 'application/port/in/workspace/candidate-content-asset.port.ts'))).toBe(false);
    expect(existsSync(resolve(AI_ROOT, 'application/port/in/workspace/sourcing-workspace-archive.port.ts'))).toBe(false);
  });

  it('removes MasterProduct-era generation and attachment entrypoints', () => {
    expect(LEGACY_FILES.filter((file) => existsSync(resolve(AI_ROOT, file)))).toEqual([]);
  });

  it('keeps registration workspace ownership while excluding legacy module tokens', () => {
    const moduleSource = readFileSync(resolve(AI_ROOT, 'ai.module.ts'), 'utf8');

    expect(moduleSource).toContain('RegistrationContentWorkspaceService');
    expect(moduleSource).toContain('REGISTRATION_CONTENT_WORKSPACE_PORT');
    expect(moduleSource).not.toMatch(
      /POST_PROMOTION|MASTER_CATALOG|PRODUCT_WORKSPACE_GROUP|CONTENT_WORKSPACE_ATTACHMENT/,
    );
  });
});
