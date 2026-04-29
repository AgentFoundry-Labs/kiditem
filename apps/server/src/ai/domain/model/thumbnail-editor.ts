export type ThumbnailEditorEditCase = 'single' | 'compose' | 'color-variants' | 'bundle';
export type ThumbnailInputRole = 'product' | 'box' | 'color_variant' | 'detail';

export interface ThumbnailEditorInputImage {
  data: string;
  mimeType: string;
  label: string;
  url: string;
  storageKey: string | null;
  role: ThumbnailInputRole;
  sortOrder: number;
  source: string;
  fileSize: number | null;
}

export interface ThumbnailEditorCandidate {
  url: string;
  filename: string | null;
  storageKey: string | null;
  mimeType: string | null;
  fileSize: number | null;
}
