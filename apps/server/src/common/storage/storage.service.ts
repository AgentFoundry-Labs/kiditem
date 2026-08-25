import { createHash } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// Nest dev/runtime compiles this service as CommonJS; sharp exports the callable
// module itself, not a callable `.default` value in that execution path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (typeof import("sharp"))["default"] = require("sharp");

const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type MultipartCleanupCapability = "unsupported";

export interface StorageServiceOptions {
  client?: S3Client;
  bucket?: string;
  publicUrl?: string;
}

/** Explicit test-only override; production composition always resolves env configuration. */
export const STORAGE_SERVICE_OPTIONS = Symbol("STORAGE_SERVICE_OPTIONS");

/**
 * S3-호환 객체 스토리지 (로컬: MinIO, 운영: S3/R2)
 *
 * 환경변수:
 *   S3_ENDPOINT       - S3 API 엔드포인트 (dev 기본값: http://localhost:9000)
 *   S3_BUCKET         - 버킷 이름 (dev 기본값: kiditem)
 *   S3_ACCESS_KEY     - 액세스 키 (dev 기본값: minioadmin)
 *   S3_SECRET_KEY     - 시크릿 키 (dev 기본값: minioadmin)
 *   S3_REGION         - 리전 (기본값: us-east-1)
 *   S3_PUBLIC_URL     - 공개 URL 베이스 (없으면 endpoint/bucket으로 추론)
 *
 * NODE_ENV=production에서는 S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET 필수.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  constructor(
    @Optional()
    @Inject(STORAGE_SERVICE_OPTIONS)
    options: StorageServiceOptions = {},
  ) {
    const isDev = process.env.NODE_ENV !== "production";
    const endpoint =
      process.env.S3_ENDPOINT || (isDev ? "http://localhost:9000" : "");
    const accessKeyId =
      process.env.S3_ACCESS_KEY || (isDev ? "minioadmin" : "");
    const secretAccessKey =
      process.env.S3_SECRET_KEY || (isDev ? "minioadmin" : "");
    this.bucket =
      options.bucket || process.env.S3_BUCKET || (isDev ? "kiditem" : "");

    if (
      (!options.client && (!endpoint || !accessKeyId || !secretAccessKey)) ||
      !this.bucket
    ) {
      throw new Error(
        "StorageService: S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET env가 필요합니다 (production은 필수, dev는 기본값 있음)",
      );
    }

    this.publicUrl =
      options.publicUrl ||
      process.env.S3_PUBLIC_URL ||
      `${endpoint.replace(/\/$/, "")}/${this.bucket}`;

    this.client =
      options.client ??
      new S3Client({
        endpoint,
        region: process.env.S3_REGION || "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // MinIO 필수, S3/R2도 호환
      });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`bucket "${this.bucket}" OK`);
    } catch (err: any) {
      this.logger.warn(
        `bucket "${this.bucket}" 접근 실패 — 이미지 업로드 동작 안 함. ` +
          `로컬: docker compose up -d minio. 운영: S3 credentials 확인. (${err?.name ?? err})`,
      );
    }
  }

  /** key 위치에 버퍼를 업로드하고 public URL 반환 */
  async save(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: IMMUTABLE_ASSET_CACHE_CONTROL,
        }),
      );
    } catch (error) {
      const storageError = error as Error & { code?: unknown };
      this.logger.error(
        `이미지 저장 실패 (${String(storageError.code ?? storageError.name ?? "unknown")})`,
        storageError.stack,
      );
      throw new ServiceUnavailableException(
        "이미지 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        { cause: error },
      );
    }
    return this.getUrl(key);
  }

  /** 같은 버킷 내에서 fromKey → toKey 복사 후 new URL 반환 */
  async copy(fromKey: string, toKey: string): Promise<string> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `/${this.bucket}/${fromKey}`,
        Key: toKey,
      }),
    );
    return this.getUrl(toKey);
  }

  /** key 삭제 */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Internal bounded multipart writer primitive. It never issues a browser URL. */
  async openMultipartUpload(input: {
    key: string;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<{ uploadId: string }> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.mimeType,
      }),
      { abortSignal: input.signal },
    );
    if (!result.UploadId)
      throw new Error("STORAGE_MULTIPART_UPLOAD_ID_MISSING");
    return { uploadId: result.UploadId };
  }

  /** Internal bounded multipart writer primitive. One bounded part is completed atomically. */
  async uploadAndCompleteMultipart(input: {
    key: string;
    uploadId: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void> {
    const part = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: 1,
        Body: input.bytes,
      }),
      { abortSignal: input.signal },
    );
    if (!part.ETag) throw new Error("STORAGE_MULTIPART_PART_ETAG_MISSING");
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: { Parts: [{ ETag: part.ETag, PartNumber: 1 }] },
        IfNoneMatch: "*",
      }),
      { abortSignal: input.signal },
    );
  }

  /**
   * Generic S3-compatible storage cannot prove exact-key multipart ordering
   * across process recreation, so deletion must treat cleanup as unknown.
   */
  multipartCleanupCapability(): MultipartCleanupCapability {
    return "unsupported";
  }

  async verifyOwnedObjectSha256(input: {
    key: string;
    expectedSha256: string;
    expectedByteLength: number;
    maxByteLength: number;
    signal: AbortSignal;
  }): Promise<void> {
    if (
      input.expectedByteLength < 0 ||
      input.expectedByteLength > input.maxByteLength
    )
      throw new Error("STORAGE_OBJECT_VERIFICATION_BOUND_INVALID");
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }),
      { abortSignal: input.signal },
    );
    if (head.ContentLength !== input.expectedByteLength) {
      throw new Error("STORAGE_OBJECT_LENGTH_MISMATCH");
    }
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        // Request one byte beyond the accepted maximum. This bounds the SDK
        // body even if the object is replaced between HEAD and GET, while
        // still making an overflow observable before hashing.
        Range: `bytes=0-${input.maxByteLength}`,
      }),
      { abortSignal: input.signal },
    );
    if (!object.Body) throw new Error("STORAGE_OBJECT_BODY_MISSING");
    if (
      object.ContentLength !== undefined &&
      object.ContentLength !== input.expectedByteLength
    ) {
      throw new Error("STORAGE_OBJECT_LENGTH_MISMATCH");
    }
    const bytes = await object.Body.transformToByteArray();
    if (bytes.byteLength !== input.expectedByteLength) {
      throw new Error("STORAGE_OBJECT_LENGTH_MISMATCH");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== input.expectedSha256) {
      throw new Error("STORAGE_OBJECT_SHA256_MISMATCH");
    }
  }

  async listExactMultipartUploads(
    key: string,
    signal: AbortSignal,
  ): Promise<Array<{ key: string; uploadId: string }>> {
    const uploads: Array<{ key: string; uploadId: string }> = [];
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    for (;;) {
      const result = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: key,
          ...(keyMarker ? { KeyMarker: keyMarker } : {}),
          ...(uploadIdMarker ? { UploadIdMarker: uploadIdMarker } : {}),
        }),
        { abortSignal: signal },
      );
      uploads.push(
        ...(result.Uploads ?? [])
          .filter((upload) => upload.Key === key && upload.UploadId)
          .map((upload) => ({ key, uploadId: upload.UploadId! })),
      );
      if (!result.IsTruncated) return uploads;
      if (!result.NextKeyMarker || !result.NextUploadIdMarker)
        throw new Error("STORAGE_MULTIPART_PAGINATION_MARKER_MISSING");
      keyMarker = result.NextKeyMarker;
      uploadIdMarker = result.NextUploadIdMarker;
    }
  }

  async abortMultipartUpload(input: {
    key: string;
    uploadId: string;
    signal: AbortSignal;
  }): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
      }),
      { abortSignal: input.signal },
    );
  }

  async deleteOwnedObject(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: input.key }),
      { abortSignal: input.signal },
    );
  }

  async headOwnedObject(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<"present" | "erased"> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }),
        { abortSignal: input.signal },
      );
      return "present";
    } catch (error) {
      if (isMissingObject(error)) return "erased";
      throw error;
    }
  }

  /** 브라우저가 서버를 경유하지 않고 고정 key에 JPEG를 업로드할 수 있는 서명 URL 발급 */
  async createPresignedPut(input: {
    key: string;
    contentType: "image/jpeg";
    expiresInSeconds: number;
    metadata: Record<string, string>;
  }): Promise<{
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: Date;
    imageUrl: string;
  }> {
    const metadata = Object.fromEntries(
      Object.entries(input.metadata).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const metadataHeaders = Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        `x-amz-meta-${key}`,
        value,
      ]),
    );
    const metadataHeaderNames = Object.keys(metadataHeaders);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      CacheControl: IMMUTABLE_ASSET_CACHE_CONTROL,
      Metadata: metadata,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set([
        "cache-control",
        "content-type",
        ...metadataHeaderNames,
      ]),
      unhoistableHeaders: new Set(metadataHeaderNames),
    });

    return {
      uploadUrl,
      headers: {
        "Content-Type": input.contentType,
        "Cache-Control": IMMUTABLE_ASSET_CACHE_CONTROL,
        ...metadataHeaders,
      },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      imageUrl: this.getUrl(input.key),
    };
  }

  /** 업로드된 객체를 bounded read하여 실제 JPEG 속성과 checksum을 검증 */
  async inspectJpeg(input: { key: string; maxByteLength: number }): Promise<{
    contentType: string;
    byteLength: number;
    pixelWidth: number;
    pixelHeight: number;
    sha256: string;
    metadata: Record<string, string>;
  }> {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }),
    );
    const contentType = head.ContentType ?? "";
    const byteLength = head.ContentLength ?? 0;

    if (contentType !== "image/jpeg") {
      throw new Error(
        `StorageService: JPEG content type이 아닙니다 (${contentType || "missing"})`,
      );
    }
    if (byteLength <= 0 || byteLength > input.maxByteLength) {
      throw new Error(
        `StorageService: JPEG 크기 제한을 벗어났습니다 (${byteLength}/${input.maxByteLength})`,
      );
    }

    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: input.key }),
    );
    const body = object.Body;
    if (!body || typeof body.transformToByteArray !== "function") {
      throw new Error("StorageService: JPEG body를 읽을 수 없습니다");
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    if (bytes.byteLength !== byteLength) {
      throw new Error(
        `StorageService: JPEG 객체 크기가 HEAD와 다릅니다 (${bytes.byteLength}/${byteLength})`,
      );
    }
    if (
      bytes.byteLength < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.byteLength - 2] !== 0xff ||
      bytes[bytes.byteLength - 1] !== 0xd9
    ) {
      throw new Error("StorageService: 유효한 JPEG body가 아닙니다");
    }

    const image = await sharp(bytes).metadata();
    if (image.format !== "jpeg" || !image.width || !image.height) {
      throw new Error("StorageService: JPEG dimensions를 확인할 수 없습니다");
    }

    return {
      contentType,
      byteLength,
      pixelWidth: image.width,
      pixelHeight: image.height,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      metadata: head.Metadata ?? {},
    };
  }

  /** key → public URL */
  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  /** public URL → key (이 서비스의 URL이 아니면 null) */
  extractKey(url: string): string | null {
    if (!url.startsWith(this.publicUrl + "/")) return null;
    return url.substring(this.publicUrl.length + 1);
  }
}

function isMissingObject(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: unknown } })
    ?.$metadata?.httpStatusCode;
  const name = (error as { name?: unknown })?.name;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}
