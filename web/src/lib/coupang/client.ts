import crypto from "crypto";

const COUPANG_HOST = "api-gateway.coupang.com";
const COUPANG_BASE_URL = `https://${COUPANG_HOST}`;
const REQUEST_TIMEOUT = 30000; // 30초

interface CoupangRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

function generateAuthorization(
  method: string,
  path: string,
  query: string
): string {
  const accessKey = getEnvOrThrow("COUPANG_ACCESS_KEY");
  const secretKey = getEnvOrThrow("COUPANG_SECRET_KEY");

  const datetime =
    new Date()
      .toISOString()
      .substring(2, 19)
      .replace(/:/g, "")
      .replace(/-/g, "") + "Z";

  const message = datetime + method + path + query;

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function coupangRequest<T = unknown>({
  method,
  path,
  query = {},
  body,
}: CoupangRequestOptions): Promise<T> {
  const queryString = new URLSearchParams(query).toString();
  const authorization = generateAuthorization(method, path, queryString);

  const url = queryString
    ? `${COUPANG_BASE_URL}${path}?${queryString}`
    : `${COUPANG_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    Authorization: authorization,
    "X-EXTENDED-TIMEOUT": "90000",
  };

  // 타임아웃 설정
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body && (method === "POST" || method === "PUT")) {
    const jsonBody = JSON.stringify(body);
    fetchOptions.body = jsonBody;
    headers["Content-Length"] = String(Buffer.byteLength(jsonBody, "utf8"));
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Coupang API error ${response.status}: ${errorText}`);
    }

    // JSON 응답인지 확인
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      const text = await response.text();
      throw new Error(`Coupang API returned non-JSON response: ${text.substring(0, 200)}`);
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export function getVendorId(): string {
  return getEnvOrThrow("COUPANG_VENDOR_ID");
}
