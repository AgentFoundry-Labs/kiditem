import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromPattern, ownerSource, scanSource } from '../../test-helpers/architecture-rg';

const AI_ROOT = path.resolve(__dirname, '..');
const { at, importers, ownerFiles } = ownerSource(AI_ROOT);
const OTHER_OWNERS = 'channels|products|sourcing';

/** Outbound persistence adapters: the only places allowed to reach Prisma. */
const ALLOWED_PRISMA_PREFIXES = ['adapter/out/direct-output/', 'adapter/out/repository/'];

/** Module specifiers that reach Prisma: the generated client or the Nest PrismaService. */
const PRISMA_SPECIFIER = String.raw`@prisma/client|[^'"]*prisma/prisma\.service`;

describe('ai architecture ratchet', () => {
  it('keeps AI incoming ports grouped under capability directories', () => {
    const directInPorts = scanSource({
      roots: [at('application/port/in')],
      relativeTo: AI_ROOT,
    }).hits.filter((file) => file.endsWith('.port.ts') && path.dirname(file) === 'application/port/in');

    expect(
      directInPorts,
      `AI incoming ports should live under capability folders:\n${directInPorts.join('\n')}`,
    ).toEqual([]);
  });

  it('does not add new Prisma client leaks outside the outbound persistence adapters', () => {
    const violators = importers([AI_ROOT], PRISMA_SPECIFIER).filter(
      (file) => !ALLOWED_PRISMA_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );

    expect(
      violators,
      `new AI Prisma leaks must be routed through outbound repository/provider ports:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the application layer Prisma-free', () => {
    const hits = importers([at('application')], PRISMA_SPECIFIER);

    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps application services free of new concrete adapter imports', () => {
    const hits = importers(
      [at('application/service'), at('application/port')],
      String.raw`[^'"]*adapter/(?:out|in)/`,
    );

    expect(
      hits,
      `application code should depend on application ports/DTOs, not concrete adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps application services behind the image storage port', () => {
    const hits = importers([at('application/service')], String.raw`[^'"]*common/storage/storage\.service`);

    expect(
      hits,
      `application services should inject IMAGE_STORAGE_PORT instead of concrete StorageService:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps Gemini SDK calls inside outgoing adapters', () => {
    const hits = importers([at('application'), at('domain')], '@google/genai');

    expect(
      hits,
      `provider SDK calls belong behind outbound provider ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps application service specs on port seams instead of concrete repository adapters', () => {
    // scanSource always excludes test sources, so this rule over specs walks
    // application/service itself: every `__tests__/` file and co-located
    // `*.spec.ts`/`*.test.ts`, at any depth. A spec reaches a concrete
    // repository adapter by importing it or by `vi.mock`-ing its module path.
    const serviceDir = at('application/service');
    const repositoryImport = new RegExp(importFromPattern(String.raw`[^'"]*adapter/out/repository`), 'm');
    const repositoryMock = /\bvi\.(?:do)?[mM]ock\(\s*['"][^'"]*adapter\/out\/repository/;
    const hits = readdirSync(serviceDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => /(?:^|\/)__tests__\/.*\.ts$|\.(?:spec|test)\.ts$/.test(file))
      .filter((file) => {
        const source = readFileSync(path.join(serviceDir, file), 'utf8');
        return repositoryImport.test(source) || repositoryMock.test(source);
      })
      .sort();

    expect(
      hits,
      `application service specs should use port fakes; Prisma call-shape belongs in adapter specs:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps thumbnail repository internals out of the legacy Prisma helper folder', () => {
    const hits = importers(
      [at('adapter/out/repository')],
      String.raw`[^'"]*\.\./prisma/(?:thumbnail-generation|thumbnail-analysis|master-image-select)`,
    );

    expect(
      hits,
      `thumbnail repository adapters should keep Prisma helper modules repository-local:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('does not leave legacy thumbnail Prisma helper files under adapter/out/prisma', () => {
    const files = ownerFiles().filter((file) =>
      /^adapter\/out\/prisma\/(?:thumbnail-.*\.(?:query|persistence)\.ts|master-image-select\.preset\.ts)$/.test(file),
    );

    expect(
      files,
      `legacy thumbnail Prisma helpers should be deleted or moved beside repository adapters:\n${files.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps incoming HTTP adapters out of outgoing ports and repository adapters', () => {
    const hits = importers([at('adapter/in/http')], String.raw`[^'"]*(?:application/port/out|adapter/out)/`);

    expect(
      hits,
      `incoming adapters should call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps outgoing adapters off other owners\' application services', () => {
    const hits = importers(
      [at('adapter/out')],
      String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/service/`,
    );

    expect(
      hits,
      `outgoing adapters must reach other owners through their published ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
