const DEFAULT_AUTH_REDIRECT = '/';
const LOCAL_REDIRECT_ORIGIN = 'https://kiditem.local';

export function sanitizeInternalRedirectPath(input: string | null | undefined): string {
  const candidate = input?.trim();
  if (!candidate) return DEFAULT_AUTH_REDIRECT;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return DEFAULT_AUTH_REDIRECT;
  if (candidate.includes('\\') || /[\x00-\x1F\x7F]/.test(candidate)) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const url = new URL(candidate, LOCAL_REDIRECT_ORIGIN);
    if (url.origin !== LOCAL_REDIRECT_ORIGIN) return DEFAULT_AUTH_REDIRECT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
