import type { EditUseCase } from '../../components/UseCaseSelection';

export type EditorMode = 'edit' | 'creative';

export interface HistoryCandidate {
  url: string;
  filename: string;
  method: string;
  createdAt: string;
  generationId: string | null;
}

export const EDIT_CASE_LABEL: Record<EditUseCase, string> = {
  compose: '상품+박스/세트 합성',
  'color-variants': '색상별 상품 배치',
  single: '단일 상품 정리',
  bundle: '번들 구성 합성',
};

const VALID_EDIT_CASES: EditUseCase[] = ['compose', 'color-variants', 'single', 'bundle'];

export function parseEditCaseParam(value: string | null): EditUseCase | null {
  return value && (VALID_EDIT_CASES as string[]).includes(value) ? (value as EditUseCase) : null;
}
