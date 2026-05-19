import { execSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const AI_ROOT = path.resolve(__dirname, '..');

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function aiRel(...segments: string[]): string {
  return path.join(path.relative(REPO_ROOT, AI_ROOT), ...segments);
}

const PR2A_CONTENT_PRISMA_DEBT: string[] = [];

const PR2B_THUMBNAIL_PRISMA_DEBT: string[] = [];

const PR2A_ADAPTER_IMPORT_DEBT: string[] = [];

const PR2B_ADAPTER_IMPORT_DEBT: string[] = [];

const ALLOWED_PRISMA_PREFIXES = [
  aiRel('adapter/out/agent-output') + path.sep,
  aiRel('adapter/out/agent-runtime') + path.sep,
  aiRel('adapter/out/repository') + path.sep,
];

const PRISMA_ALLOWLIST = new Set([
  ...PR2A_CONTENT_PRISMA_DEBT,
  ...PR2B_THUMBNAIL_PRISMA_DEBT,
  aiRel('adapter/in/http/thumbnail-editor.controller.ts'),
  aiRel('adapter/out/products/master-catalog.adapter.ts'),
]);

const ADAPTER_IMPORT_ALLOWLIST = new Set([
  ...PR2A_ADAPTER_IMPORT_DEBT,
  ...PR2B_ADAPTER_IMPORT_DEBT,
]);

function withoutAllowedPrefixes(files: string[], prefixes: string[]): string[] {
  return files.filter((file) => !prefixes.some((prefix) => file.startsWith(prefix)));
}

describe('ai architecture ratchet', () => {
  it('does not add new Prisma client leaks outside documented PR 2A/2B seams', () => {
    const ai = aiRel();
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService|@prisma/client|Prisma\\.' ${ai} --glob '!**/__tests__/**'`,
    );
    const violators = withoutAllowedPrefixes(hits, ALLOWED_PRISMA_PREFIXES).filter(
      (file) => !PRISMA_ALLOWLIST.has(file),
    );

    expect(
      violators,
      `new AI Prisma leaks must be routed through outbound repository/provider ports:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('tracks the PR 2A content/detail-page application Prisma debt exactly', () => {
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService|@prisma/client|Prisma\\.' ${aiRel(
        'application',
      )} --glob '!**/__tests__/**'`,
    );
    const remainingPr2A = hits.filter((file) => PR2A_CONTENT_PRISMA_DEBT.includes(file)).sort();

    expect(
      remainingPr2A,
      'when a PR 2A file moves behind a port, shrink PR2A_CONTENT_PRISMA_DEBT in this test',
    ).toEqual([...PR2A_CONTENT_PRISMA_DEBT].sort());
  });

  it('keeps application services free of new concrete adapter imports', () => {
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./.*adapter/(out|in)|adapter/(out|in)/' ${aiRel(
        'application/service',
      )} ${aiRel('application/port')} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !ADAPTER_IMPORT_ALLOWLIST.has(file));

    expect(
      violators,
      `application code should depend on application ports/DTOs, not concrete adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps application services behind the image storage port', () => {
    const hits = rg(
      `--type ts --files-with-matches 'common/storage/storage.service|StorageService' ${aiRel(
        'application/service',
      )} --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `application services should inject IMAGE_STORAGE_PORT instead of concrete StorageService:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps Gemini SDK calls inside outgoing adapters', () => {
    const hits = rg(
      `--type ts --files-with-matches '@google/genai|GoogleGenAI|Modality' ${aiRel(
        'application',
      )} ${aiRel('domain')} ${aiRel('mapper')} --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `provider SDK calls belong behind outbound provider ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps application service specs on port seams instead of concrete repository adapters', () => {
    const hits = rg(
      `--type ts --files-with-matches 'adapter/out/repository' ${aiRel(
        'application/service/__tests__',
      )}`,
    );

    expect(
      hits,
      `application service specs should use port fakes; Prisma call-shape belongs in adapter specs:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps thumbnail repository internals out of the legacy Prisma helper folder', () => {
    const hits = rg(
      `--type ts --files-with-matches '../prisma/(thumbnail-generation|thumbnail-analysis|master-image-select)' ${aiRel(
        'adapter/out/repository',
      )} --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `thumbnail repository adapters should keep Prisma helper modules repository-local:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('does not leave legacy thumbnail Prisma helper files under adapter/out/prisma', () => {
    const files = rg(
      `--files ${aiRel('adapter/out')} --glob 'prisma/thumbnail-*.query.ts' --glob 'prisma/thumbnail-*.persistence.ts' --glob 'prisma/master-image-select.preset.ts'`,
    );

    expect(
      files,
      `legacy thumbnail Prisma helpers should be deleted or moved beside repository adapters:\n${files.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps incoming HTTP adapters out of outgoing ports and repository adapters', () => {
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/' --glob '${aiRel(
        'adapter/in/http/**',
      )}' --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `incoming adapters should call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('documents the remaining outgoing adapter dependency on another owner service', () => {
    const hits = rg(
      `--type ts --files-with-matches 'channels/application/service|products/application/service|sourcing/application/service' ${aiRel(
        'adapter/out',
      )} --glob '!**/__tests__/**'`,
    ).sort();

    expect(
      hits,
      'replace this with owner-side incoming ports in PR 2A',
    ).toEqual([aiRel('adapter/out/channels/coupang-image-reconciliation.adapter.ts')]);
  });
});
