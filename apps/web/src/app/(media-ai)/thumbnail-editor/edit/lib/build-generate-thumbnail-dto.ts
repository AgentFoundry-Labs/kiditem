import type { EditUseCase } from '../../components/UseCaseSelection';
import type { SupplementaryLabel } from '../../components/EditorInputPanel';
import {
  pickCaseFromSlots,
  slotsToDto,
  type LayoutKindLite,
  type Slot,
} from './slots';
import type { EditorMode } from './edit-page-types';

interface BuildGenerateThumbnailDtoParams {
  mode: EditorMode;
  slots: Slot[];
  productId: string | null;
  supplementaryLabel: SupplementaryLabel;
  pieceCount: number | null;
  imageOnly: boolean;
  userPrompt: string;
  sceneType: string;
  styleType: string;
  productDescription: string;
  productName: string;
  effectiveProductImage: string | null;
  layout: LayoutKindLite;
}

export function buildGenerateThumbnailDto({
  mode,
  slots,
  productId,
  supplementaryLabel,
  pieceCount,
  imageOnly,
  userPrompt,
  sceneType,
  styleType,
  productDescription,
  productName,
  effectiveProductImage,
  layout,
}: BuildGenerateThumbnailDtoParams) {
  const resolvedCase: EditUseCase | null = mode === 'creative' ? null : pickCaseFromSlots(slots);

  return slotsToDto(slots, resolvedCase, {
    productId,
    supplementaryLabel,
    pieceCount,
    purpose: mode === 'creative' ? 'quality' : 'compliance',
    mode,
    userPrompt: imageOnly ? '' : userPrompt,
    sceneType,
    styleType,
    productDescription: imageOnly ? '' : productDescription,
    productName,
    productImageOverride: effectiveProductImage,
    layout: imageOnly ? 'auto' : layout,
  });
}
