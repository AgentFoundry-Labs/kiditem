import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DetailPageEditorController } from './detail-page-editor.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('DetailPageEditorController.list', () => {
  it('refuses the removed sourceCandidateId filter instead of listing the whole organization', () => {
    const service = { list: vi.fn() };
    const controller = new DetailPageEditorController(service as never);

    expect(() => controller.list(ORG, undefined, undefined, 'candidate-1')).toThrow(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists one workspace when contentWorkspaceId is given', () => {
    const service = { list: vi.fn().mockResolvedValue([]) };
    const controller = new DetailPageEditorController(service as never);

    void controller.list(ORG, WORKSPACE_ID, undefined, undefined);
    expect(service.list).toHaveBeenCalledWith(ORG, { contentWorkspaceId: WORKSPACE_ID, templateId: undefined });
  });
});
