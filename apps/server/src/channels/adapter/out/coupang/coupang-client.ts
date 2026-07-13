import crypto from 'crypto';
import { CoupangProviderRequestError } from '../../../application/port/out/provider/coupang-provider.port';

const COUPANG_HOST = 'api-gateway.coupang.com';
const COUPANG_BASE_URL = `https://${COUPANG_HOST}`;
const REQUEST_TIMEOUT = 30000;

export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

interface CoupangRequestOptions {
  credentials: CoupangCredentials;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  beforeDispatch?: () => Promise<void>;
}

function generateAuthorization(
  credentials: CoupangCredentials,
  method: string,
  path: string,
  query: string,
): string {
  const datetime =
    new Date()
      .toISOString()
      .substring(2, 19)
      .replace(/:/g, '')
      .replace(/-/g, '') + 'Z';

  const message = datetime + method + path + query;

  const signature = crypto
    .createHmac('sha256', credentials.secretKey)
    .update(message)
    .digest('hex');

  return `CEA algorithm=HmacSHA256, access-key=${credentials.accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function coupangRequest<T = unknown>({
  credentials,
  method,
  path,
  query = {},
  body,
  beforeDispatch,
}: CoupangRequestOptions): Promise<T> {
  const queryString = new URLSearchParams(query).toString();
  const authorization = generateAuthorization(credentials, method, path, queryString);

  const url = queryString
    ? `${COUPANG_BASE_URL}${path}?${queryString}`
    : `${COUPANG_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    Authorization: authorization,
    'X-EXTENDED-TIMEOUT': '90000',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    const jsonBody = JSON.stringify(body);
    fetchOptions.body = jsonBody;
    headers['Content-Length'] = String(Buffer.byteLength(jsonBody, 'utf8'));
  }

  try {
    await beforeDispatch?.();
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const providerOutcome = response.status >= 400
        && response.status < 500
        && response.status !== 408
        && response.status !== 409
        ? 'definitive_failure'
        : 'uncertain';
      throw new CoupangProviderRequestError(
        `Coupang API error ${response.status}: ${errorText}`,
        response.status,
        providerOutcome,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      const text = await response.text();
      throw new Error(
        `Coupang API returned non-JSON response: ${text.substring(0, 200)}`,
      );
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}
