import type { EditUseCase } from '../../components/control/UseCaseSelection';
import type { SupplementaryLabel } from '../../components/input/EditorInputPanel';
import {
  thumbnailSubjectToDtoIdentity,
  type ThumbnailSubject,
} from '../../../_shared/lib/thumbnail-subject';
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
  subject?: ThumbnailSubject;
  productId: string | null;
  sourceCandidateId?: string | null;
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
  subject,
  productId,
  sourceCandidateId,
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
  const identity = subject
    ? thumbnailSubjectToDtoIdentity(subject)
    : { productId, sourceCandidateId: sourceCandidateId ?? null, contentWorkspaceId: null };

  return slotsToDto(slots, resolvedCase, {
    productId: identity.productId,
    sourceCandidateId: identity.sourceCandidateId,
    contentWorkspaceId: identity.contentWorkspaceId,
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
