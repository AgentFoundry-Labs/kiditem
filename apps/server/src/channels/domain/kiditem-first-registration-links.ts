const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KidItemFirstOptionLink = Readonly<{
  externalOptionId: string;
  productVariantId: string;
  providerOptionKey: string;
}>;

export type KidItemFirstRegistrationLinks = Readonly<{
  masterProductId?: string;
  optionLinks: KidItemFirstOptionLink[];
}>;

export function providerOptionKey(submissionKey: string, index: number): string {
  return index === 0 ? submissionKey : `${submissionKey}:${index}`;
}

export function parseKidItemFirstRegistrationLinks(
  value: unknown,
  submissionKey: string,
): KidItemFirstRegistrationLinks {
  const payload = asRecord(value);
  const registrationInput = asRecord(payload.registrationInput);
  const rawOptionLinks = registrationInput.optionLinks;
  const normalized = normalizeKidItemFirstRegistrationLinks({
    masterProductId: registrationInput.masterProductId,
    optionLinks: rawOptionLinks,
  }, submissionKey);
  if (rawOptionLinks === undefined) return normalized;
  const listingPayload = asRecord(registrationInput.listingPayload);
  const selected = Object.keys(listingPayload).length > 0
    ? listingPayload
    : registrationInput;
  const items = Array.isArray(selected.items) ? selected.items : [];
  if (!Array.isArray(rawOptionLinks) || rawOptionLinks.length !== items.length) {
    throw new Error('KidItem-first option link count must match marketplace item count.');
  }
  return normalized;
}

export function normalizeKidItemFirstRegistrationLinks(
  input: {
    masterProductId?: unknown;
    optionLinks?: unknown;
  },
  submissionKey: string,
): KidItemFirstRegistrationLinks {
  const masterProductId = input.masterProductId === undefined
    ? undefined
    : uuid(input.masterProductId, 'KidItem-first masterProductId');
  if (input.optionLinks === undefined) {
    return masterProductId ? { masterProductId, optionLinks: [] } : { optionLinks: [] };
  }
  if (!Array.isArray(input.optionLinks)) {
    throw new Error('KidItem-first optionLinks must be an array.');
  }
  if (input.optionLinks.length > 0 && !masterProductId) {
    throw new Error('KidItem-first option links require a MasterProduct identity.');
  }
  const optionLinks = input.optionLinks.map((rawLink, index) => {
    const link = asRecord(rawLink);
    const externalOptionId = normalizedOptionId(
      link.externalOptionId,
      `KidItem-first optionLinks[${index}].externalOptionId`,
    );
    return {
      externalOptionId,
      productVariantId: uuid(
        link.productVariantId,
        `KidItem-first optionLinks[${index}].productVariantId`,
      ),
      providerOptionKey: providerOptionKey(submissionKey, index),
    };
  });
  if (new Set(optionLinks.map((link) => link.externalOptionId)).size !== optionLinks.length) {
    throw new Error('KidItem-first option identities must be unique.');
  }
  return masterProductId
    ? { masterProductId, optionLinks }
    : { optionLinks };
}

function uuid(value: unknown, field: string): string {
  const normalized = requiredString(value, field);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a UUID.`);
  return normalized;
}

function normalizedOptionId(value: unknown, field: string): string {
  const normalized = requiredString(value, field).normalize('NFKC');
  if (normalized.length > 60) throw new Error(`${field} must be at most 60 characters.`);
  return normalized;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
