import type { GeneratedChannelFile } from '../../out/documents/channel-documents.port';

export const CHANNEL_DOCUMENT_EXPORT_PORT = Symbol(
  'CHANNEL_DOCUMENT_EXPORT_PORT',
);
export interface ChannelDocumentExportPort {
  registration(
    template: Uint8Array,
    products: unknown,
    fileName?: string,
  ): GeneratedChannelFile & { productCount: number };
  inventory(
    products: unknown,
    generatedAt: Date,
    fileName?: string,
  ): GeneratedChannelFile & { columns: string[] };
}
