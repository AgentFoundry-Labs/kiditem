export interface RegistrationThumbnailGeneration {
  id?: string | null;
  candidates: Array<{
    id?: string | null;
    url?: string | null;
  }>;
}

export interface RegistrationThumbnailOption {
  url: string;
  kind: 'source' | 'generated';
  generatedGenerationId: string | null;
  generatedCandidateId: string | null;
}

export function buildRegistrationThumbnailOptions(input: {
  sourceImageUrls: string[];
  generations: RegistrationThumbnailGeneration[];
}): RegistrationThumbnailOption[] {
  const seen = new Set<string>();
  const options: RegistrationThumbnailOption[] = [];

  for (const url of input.sourceImageUrls) {
    const normalized = normalizeDisplayUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    options.push({
      url: normalized,
      kind: 'source',
      generatedGenerationId: null,
      generatedCandidateId: null,
    });
  }

  for (const generation of input.generations) {
    for (const candidate of generation.candidates) {
      const normalized = normalizeDisplayUrl(candidate.url);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      options.push({
        url: normalized,
        kind: 'generated',
        generatedGenerationId: generation.id ?? null,
        generatedCandidateId: candidate.id ?? null,
      });
    }
  }

  return options;
}

export function selectedThumbnailGenerationCandidateId(
  selectedUrl: string | null | undefined,
  generations: RegistrationThumbnailGeneration[],
): string | null {
  const normalizedSelected = normalizeDisplayUrl(selectedUrl);
  if (!normalizedSelected) return null;
  for (const generation of generations) {
    for (const candidate of generation.candidates) {
      if (normalizeDisplayUrl(candidate.url) === normalizedSelected && candidate.id) {
        return candidate.id;
      }
    }
  }
  return null;
}

export function selectedThumbnailGenerationId(
  selectedUrl: string | null | undefined,
  generations: RegistrationThumbnailGeneration[],
): string | null {
  const normalizedSelected = normalizeDisplayUrl(selectedUrl);
  if (!normalizedSelected) return null;
  for (const generation of generations) {
    if (!generation.id) continue;
    if (generation.candidates.some(
      (candidate) => normalizeDisplayUrl(candidate.url) === normalizedSelected,
    )) {
      return generation.id;
    }
  }
  return null;
}

function normalizeDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
