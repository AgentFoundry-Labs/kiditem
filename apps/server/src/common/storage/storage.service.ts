import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

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

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';
    const endpoint = process.env.S3_ENDPOINT || (isDev ? 'http://localhost:9000' : '');
    const accessKeyId = process.env.S3_ACCESS_KEY || (isDev ? 'minioadmin' : '');
    const secretAccessKey = process.env.S3_SECRET_KEY || (isDev ? 'minioadmin' : '');
    this.bucket = process.env.S3_BUCKET || (isDev ? 'kiditem' : '');

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      throw new Error(
        'StorageService: S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET env가 필요합니다 (production은 필수, dev는 기본값 있음)',
      );
    }

    this.publicUrl =
      process.env.S3_PUBLIC_URL || `${endpoint.replace(/\/$/, '')}/${this.bucket}`;

    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** key → public URL */
  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  /** public URL → key (이 서비스의 URL이 아니면 null) */
  extractKey(url: string): string | null {
    if (!url.startsWith(this.publicUrl + '/')) return null;
    return url.substring(this.publicUrl.length + 1);
  }
}
