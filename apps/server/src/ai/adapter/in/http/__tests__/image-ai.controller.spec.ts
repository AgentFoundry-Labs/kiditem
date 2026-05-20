import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ImageAiController } from '../image-ai.controller';

const ORG = 'organization-1';
const USER = 'user-1';

function makeController() {
  const imageAiService = {
    createEditTask: vi.fn().mockResolvedValue({ taskId: 'image-job-1' }),
    getEditTask: vi.fn().mockResolvedValue({
      taskId: 'image-job-1',
      status: 'running',
      output: null,
      errorCode: null,
      errorMessage: null,
    }),
    cancelEditTask: vi.fn().mockResolvedValue({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    }),
  };
  const imageAssetOperation = {
    cropImage: vi.fn(),
  };
  return {
    imageAiService,
    controller: new ImageAiController(
      imageAiService as never,
      imageAssetOperation as never,
    ),
  };
}

describe('ImageAiController', () => {
  it('exposes a task cancellation route', () => {
    expect(route(ImageAiController, 'cancelTask')).toEqual({
      method: RequestMethod.POST,
      path: 'tasks/:taskId/cancel',
    });
  });

  it('passes organization and actor to direct image edit task cancellation', async () => {
    const { controller, imageAiService } = makeController();

    const result = await controller.cancelTask(
      'image-job-1',
      { reason: '사용자 요청' },
      ORG,
      { id: USER } as never,
    );

    expect(imageAiService.cancelEditTask).toHaveBeenCalledWith(
      ORG,
      'image-job-1',
      USER,
      '사용자 요청',
    );
    expect(result.status).toBe('cancelled');
  });
});

type ControllerClass = { prototype: object };

function route(controller: ControllerClass, methodName: string) {
  const handler = Reflect.get(controller.prototype, methodName) as object;
  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  };
}
