import { describe, expect, it } from 'vitest';
import type { ThumbnailSubject } from '../../../_shared/lib/thumbnail-subject';
import { buildGenerateThumbnailDto } from './build-generate-thumbnail-dto';
import type { Slot } from './slots';

describe('buildGenerateThumbnailDto', () => {
  it('sends the populated color variant count with color images', () => {
    const slots: Slot[] = [
      {
        id: 'slot-red',
        kind: 'color_variant',
        label: 'Red',
        role: 'color_variant',
        value: 'https://cdn.example.com/red.jpg',
        source: 'upload',
      },
      {
        id: 'slot-blue',
        kind: 'color_variant',
        label: 'Blue',
        role: 'color_variant',
        value: 'https://cdn.example.com/blue.jpg',
        source: 'upload',
      },
    ];

    expect(
      buildGenerateThumbnailDto({
        mode: 'edit',
        slots,
        contentWorkspaceId: 'workspace-1',
        supplementaryLabel: '박스',
        pieceCount: null,
        imageOnly: true,
        userPrompt: '',
        sceneType: 'white-studio',
        styleType: 'minimal',
        productDescription: '',
        productName: '컬러 상품',
        effectiveProductImage: null,
        layout: 'auto',
      }),
    ).toMatchObject({
      colorImages: [
        'https://cdn.example.com/red.jpg',
        'https://cdn.example.com/blue.jpg',
      ],
      colorCount: 2,
    });
  });

  it('uses the reference image without forwarding the UI-only custom-reference scene', () => {
    const slots: Slot[] = [
      {
        id: 'slot-product',
        kind: 'product',
        label: 'Main product',
        role: 'product',
        value: 'https://cdn.example.com/product.jpg',
        source: 'upload',
      },
      {
        id: 'slot-reference',
        kind: 'reference',
        label: 'Style reference',
        role: 'detail',
        value: 'https://cdn.example.com/reference.jpg',
        source: 'upload',
      },
    ];

    const dto = buildGenerateThumbnailDto({
      mode: 'creative',
      slots,
      contentWorkspaceId: 'workspace-1',
      supplementaryLabel: '박스',
      pieceCount: null,
      imageOnly: false,
      userPrompt: '참조 이미지의 분위기를 반영해줘',
      sceneType: 'custom-reference',
      styleType: 'minimal',
      productDescription: '상품 설명',
      productName: '참조 상품',
      effectiveProductImage: null,
      layout: 'auto',
    });

    expect(dto.backgroundReference).toBe('https://cdn.example.com/reference.jpg');
    expect(dto.sceneType).toBeUndefined();
  });

  it('attaches collected-product thumbnail work to the draft’s content workspace, never a candidate id (B4)', () => {
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

    const dto = buildGenerateThumbnailDto({
      mode: 'edit',
      slots,
      contentWorkspaceId: 'workspace-1',
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
    });

    expect(dto).toMatchObject({
      contentWorkspaceId: 'workspace-1',
      productImage: 'https://cdn.example.com/source.jpg',
    });
    expect(dto).not.toHaveProperty('sourceCandidateId');
  });

  it('sends the sales-product id, not a workspace, for work opened from a draft without a workspace', () => {
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

    const dto = buildGenerateThumbnailDto({
      mode: 'edit',
      slots,
      subject: { kind: 'sales-product-draft', salesProductId: 'sales-product-1' },
      contentWorkspaceId: null,
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
    });

    expect(dto.salesProductId).toBe('sales-product-1');
    expect(dto.contentWorkspaceId).toBeUndefined();
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
      contentWorkspaceId: 'workspace-1',
    });
  });
});
