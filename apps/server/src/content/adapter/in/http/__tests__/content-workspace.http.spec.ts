import 'reflect-metadata';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_DEFINITIONS, ErrorResponseSchema } from '@kiditem/shared/errors';
import { GlobalExceptionFilter } from '../../../../../common/filters/global-exception.filter';
import { ContentWorkspaceController } from '../content-workspace.controller';
import { ContentWorkspaceService } from '../../../../application/service/content-workspace.service';
import { ContentAssetService } from '../../../../application/service/content-asset.service';
import { CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT } from '../../../../application/port/out/repository/content-workspace-lifecycle.repository.port';
import { DETAIL_PAGE_REPOSITORY_PORT } from '../../../../application/port/out/repository/detail-page.repository.port';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from '../../../../application/port/in/workspace/registration-content-workspace.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('content workspace HTTP error envelope (KID-343)', () => {
  let app: INestApplication;
  const repository = { getById: vi.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [ContentWorkspaceController],
      providers: [
        ContentWorkspaceService,
        { provide: CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, useValue: repository },
        { provide: DETAIL_PAGE_REPOSITORY_PORT, useValue: {} },
        { provide: ContentAssetService, useValue: {} },
        { provide: REGISTRATION_CONTENT_WORKSPACE_PORT, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: 'user-1', organizationId: ORGANIZATION_ID };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it('answers a workspace outside the organization with 404 CONTENT_NOT_FOUND in Korean', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/ai/content-workspaces/${WORKSPACE_ID}`)
      .expect(404);

    expect(ErrorResponseSchema.parse(response.body)).toEqual({
      statusCode: 404,
      code: 'CONTENT_NOT_FOUND',
      kind: 'not_found',
      message: ERROR_DEFINITIONS.CONTENT_NOT_FOUND.text,
      errors: [],
      details: { reason: 'workspace' },
    });
    expect(repository.getById).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, workspaceId: WORKSPACE_ID });
  });
});
