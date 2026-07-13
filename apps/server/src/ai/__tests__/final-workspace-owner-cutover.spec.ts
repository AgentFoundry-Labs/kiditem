import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const AI_ROOT = resolve(import.meta.dirname, '..');

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

describe('AI final workspace-owner cutover', () => {
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
