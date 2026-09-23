import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EditJobsDto } from '../thumbnail-edit.dto';
import { ThumbnailEditorDto } from '../thumbnail-editor.dto';

async function messages(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('thumbnail HTTP identity DTOs', () => {
  it.each([
    Object.assign(new ThumbnailEditorDto(), {
      productId: 'workspace-1',
      productImage: 'https://cdn.example.com/product.jpg',
      purpose: 'compliance',
    }),
    Object.assign(new EditJobsDto(), { productIds: ['workspace-1'] }),
  ])('rejects a retired product identity input', async (dto) => {
    expect(await messages(dto)).toEqual(
      expect.arrayContaining([expect.stringContaining('contentWorkspace')]),
    );
  });

  it.each([
    Object.assign(new ThumbnailEditorDto(), {
      masterId: 'workspace-1',
      productImage: 'https://cdn.example.com/product.jpg',
      purpose: 'compliance',
    }),
    Object.assign(new EditJobsDto(), { masterIds: ['workspace-1'] }),
  ])('rejects a retired master identity input', async (dto) => {
    expect(await messages(dto)).toEqual(
      expect.arrayContaining([expect.stringContaining('contentWorkspace')]),
    );
  });

  it('accepts canonical workspace identity inputs', async () => {
    const edit = Object.assign(new EditJobsDto(), {
      contentWorkspaceIds: ['workspace-1'],
    });

    expect(await messages(edit)).toEqual([]);
  });
});
