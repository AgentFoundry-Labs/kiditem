import { describe, expect, it } from 'vitest';
import type { ThumbnailSubject } from '../../../_shared/lib/thumbnail-subject';
import { buildGenerateThumbnailDto } from './build-generate-thumbnail-dto';
import type { Slot } from './slots';

describe('buildGenerateThumbnailDto', () => {
  it('passes sourceCandidateId for candidate-owned thumbnail work', () => {
    const slots: Slot[] = [
      {
        id: 'slot-product',
        kind: 'product',
        label: 'Main product',
        role: 'product',
        value: 'https://cdn.example.com/source.jpg',
        source: 'upload',
      },
    ];

    expect(
      buildGenerateThumbnailDto({
        mode: 'edit',
        slots,
        contentWorkspaceId: null,
        sourceCandidateId: 'candidate-123',
        supplementaryLabel: '박스',
        pieceCount: null,
        imageOnly: true,
        userPrompt: 'ignored when imageOnly',
        sceneType: 'white-studio',
        styleType: 'minimal',
        productDescription: 'ignored when imageOnly',
        productName: '쭉쭉붙이는터치등',
        effectiveProductImage: null,
        layout: 'auto',
      }),
    ).toMatchObject({
      sourceCandidateId: 'candidate-123',
      contentWorkspaceId: undefined,
      productImage: 'https://cdn.example.com/source.jpg',
    });
  });

  it('accepts ThumbnailSubject as the identity Interface', () => {
    const subject: ThumbnailSubject = {
      kind: 'content-workspace',
      contentWorkspaceId: 'workspace-1',
    };

    const slots: Slot[] = [
      {
        id: 'slot-product',
        kind: 'product',
        label: 'Main product',
        role: 'product',
        value: 'https://cdn.example.com/source.jpg',
        source: 'upload',
      },
    ];

    expect(
      buildGenerateThumbnailDto({
        mode: 'edit',
        slots,
        subject,
        contentWorkspaceId: 'workspace-1',
        sourceCandidateId: null,
        supplementaryLabel: '박스',
        pieceCount: null,
        imageOnly: true,
        userPrompt: '',
        sceneType: 'white-studio',
        styleType: 'minimal',
        productDescription: '',
        productName: '쭉쭉붙이는터치등',
        effectiveProductImage: null,
        layout: 'auto',
      }),
    ).toMatchObject({
      sourceCandidateId: undefined,
      contentWorkspaceId: 'workspace-1',
    });
  });
});
