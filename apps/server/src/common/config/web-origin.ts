export function requireWebOrigin(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.WEB_ORIGIN?.trim();
  if (!configured) {
    throw new Error('Runtime configuration: WEB_ORIGIN이 필요합니다');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('WEB_ORIGIN은 경로 없는 canonical http(s) origin이어야 합니다');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('WEB_ORIGIN은 경로 없는 canonical http(s) origin이어야 합니다');
  }
  return url.origin;
}
