import type { ChannelDocumentExportPort } from '../../port/in/registration/channel-document-export.port';
import type { ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';

/** Generates proposed provider files; generation never submits a listing change. */
export class ChannelDocumentExportService implements ChannelDocumentExportPort {
  constructor(private readonly documents: ChannelDocumentsPort) {}
  registration(template: Uint8Array, products: unknown, fileName?: string) {
    return this.documents.exportWingRegistration(template, products, fileName);
  }
  inventory(products: unknown, generatedAt: Date, fileName?: string) {
    return this.documents.exportWingInventory(products, generatedAt, fileName);
  }
}
