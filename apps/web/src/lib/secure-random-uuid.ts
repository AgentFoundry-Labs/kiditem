const SECURE_UUID_UNAVAILABLE_MESSAGE =
  '이 브라우저는 안전한 수집 실행 ID 생성을 지원하지 않습니다.';

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function createSecureRandomUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error(SECURE_UUID_UNAVAILABLE_MESSAGE);
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error(SECURE_UUID_UNAVAILABLE_MESSAGE);
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}
