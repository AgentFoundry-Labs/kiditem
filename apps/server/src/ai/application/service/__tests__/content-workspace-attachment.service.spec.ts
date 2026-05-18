import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ContentWorkspaceAttachmentRepositoryPort } from '../../port/out/content-workspace-attachment.repository.port';
import { ContentWorkspaceAttachmentService } from '../content-workspace-attachment.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

function repository(
  overrides: Partial<ContentWorkspaceAttachmentRepositoryPort> = {},
): ContentWorkspaceAttachmentRepositoryPort {
  return {
    loadAttachPreflight: vi.fn(),
    attachGroupToProduct: vi.fn(),
    ...overrides,
  } as ContentWorkspaceAttachmentRepositoryPort;
}

describe('ContentWorkspaceAttachmentService', () => {
  it('attaches an unlinked group and returns the product workspace view', async () => {
    const repo = repository({
      loadAttachPreflight: vi.fn().mockResolvedValue({
        product: { id: PRODUCT_ID },
        group: { id: GROUP_ID, targetMasterId: null },
        generationCount: 2,
        productWorkspace: { id: 'product-workspace-1' },
      }),
      attachGroupToProduct: vi.fn().mockResolvedValue(undefined),
    });
    const archive = {
      listProductWorkspace: vi.fn().mockResolvedValue({ workspace: { productId: PRODUCT_ID } }),
    };
    const service = new ContentWorkspaceAttachmentService(repo, archive as never);

    await expect(service.attachGroupToProduct(ORG, GROUP_ID, PRODUCT_ID)).resolves.toEqual({
      workspace: { productId: PRODUCT_ID },
    });

    expect(repo.attachGroupToProduct).toHaveBeenCalledWith({
      organizationId: ORG,
      groupId: GROUP_ID,
      productId: PRODUCT_ID,
      productWorkspaceId: 'product-workspace-1',
    });
    expect(archive.listProductWorkspace).toHaveBeenCalledWith(ORG, PRODUCT_ID, {
      page: 1,
      limit: 100,
    });
  });

  it('rejects missing product and empty groups before attachment writes', async () => {
    const missingProduct = repository({
      loadAttachPreflight: vi.fn().mockResolvedValue({
        product: null,
        group: { id: GROUP_ID, targetMasterId: null },
        generationCount: 1,
        productWorkspace: null,
      }),
      attachGroupToProduct: vi.fn(),
    });
    const service = new ContentWorkspaceAttachmentService(missingProduct, {} as never);

    await expect(service.attachGroupToProduct(ORG, GROUP_ID, PRODUCT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(missingProduct.attachGroupToProduct).not.toHaveBeenCalled();

    const emptyGroup = repository({
      loadAttachPreflight: vi.fn().mockResolvedValue({
        product: { id: PRODUCT_ID },
        group: { id: GROUP_ID, targetMasterId: null },
        generationCount: 0,
        productWorkspace: null,
      }),
      attachGroupToProduct: vi.fn(),
    });
    const emptyService = new ContentWorkspaceAttachmentService(emptyGroup, {} as never);

    await expect(emptyService.attachGroupToProduct(ORG, GROUP_ID, PRODUCT_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(emptyGroup.attachGroupToProduct).not.toHaveBeenCalled();
  });
});
