import { Inject, Injectable } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrableDetailPage,
  type RegistrationContentWorkspacePort,
} from '../../../../content/application/port/in/workspace/registration-content-workspace.port';
import type {
  ChannelRegistrableDetailPagePort,
  RegistrableDetailHtml,
} from '../../../application/port/out/content/registrable-detail-page.port';

/** Channels 가 상세 HTML 을 Content revision 에서만 읽는 길(KID-313 W2). 저장하지 않는다. */
@Injectable()
export class RegistrableDetailPageAdapter implements ChannelRegistrableDetailPagePort {
  constructor(
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT) private readonly content: RegistrationContentWorkspacePort,
  ) {}

  async read(input: {
    organizationId: string;
    salesProductId: string;
    selectedDetailPageRevisionId: string | null;
  }): Promise<RegistrableDetailHtml | null> {
    const page = await this.content.readRegistrableDetailPage({
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      revisionId: input.selectedDetailPageRevisionId,
    });
    return page ? toDetailHtml(page) : null;
  }

  async readMany(input: {
    organizationId: string;
    products: ReadonlyArray<{ salesProductId: string; selectedDetailPageRevisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailHtml>> {
    const pages = await this.content.readRegistrableDetailPages({
      organizationId: input.organizationId,
      requests: input.products.map((product) => ({
        salesProductId: product.salesProductId,
        revisionId: product.selectedDetailPageRevisionId,
      })),
    });
    return new Map([...pages].map(([salesProductId, page]) => [salesProductId, toDetailHtml(page)]));
  }

  async importFromSource(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      source: 'sabangnet';
      html: string;
      digest: string;
      createdByUserId: string | null;
    },
  ): Promise<{ revisionId: string | null; becameCurrent: boolean }> {
    const result = await this.content.importDetailPage(transaction, input);
    return result.kind === 'appended'
      ? { revisionId: result.revisionId, becameCurrent: result.becameCurrent }
      : { revisionId: null, becameCurrent: false };
  }

  readImportedImageUrls(input: { organizationId: string }): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.content.readImportedDetailImageUrls(input);
  }

  rewriteImportedImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    replacements: ReadonlyMap<string, string>;
  }): Promise<{ revisionsUpdated: number }> {
    return this.content.rewriteImportedDetailImageUrls(input);
  }
}

function toDetailHtml(page: RegistrableDetailPage): RegistrableDetailHtml {
  return { revisionId: page.revisionId, html: page.html, imageUrls: page.imageUrls };
}
