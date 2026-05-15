import type { KidsPlayfulGenerateBody } from '../hooks/useKidsPlayfulGenerate';

interface GenerateSourceParamReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export function getGenerateSourceReferences(
  searchParams: GenerateSourceParamReader,
  productId: string | null,
): NonNullable<KidsPlayfulGenerateBody['sourceReferences']> {
  const references: NonNullable<KidsPlayfulGenerateBody['sourceReferences']> = [];
  const candidateIds = new Set<string>();
  for (const value of searchParams.getAll('sourceCandidateId')) {
    if (value.trim()) candidateIds.add(value.trim());
  }
  for (const value of (searchParams.get('sourceCandidateIds') ?? '').split(',')) {
    if (value.trim()) candidateIds.add(value.trim());
  }
  for (const sourceCandidateId of candidateIds) {
    references.push({ sourceType: 'sourcing_candidate', sourceCandidateId });
  }
  void productId;
  return references;
}
