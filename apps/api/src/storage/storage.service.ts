import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";

/** Prefix for browser uploads awaiting checks; objects there expire after a day (lifecycle rule). */
export const QUARANTINE_PREFIX = "cv-uploads/";
export const QUARANTINE_EXPIRY_DAYS = 1;

export function createS3Client(env: Env): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // The SDK's default checksums add headers/query parameters that presigned browser uploads
    // cannot satisfy and that S3-compatible stores (R2, SeaweedFS) do not all support.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Object storage (S3 API) for user files. Keys never contain personal data beyond opaque ids. */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = createS3Client(env);
    this.bucket = env.S3_BUCKET;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  /**
   * A presigned PUT for exactly this content type and length: both are signed, so the store
   * rejects a different file (the confirm step still checks what arrived).
   */
  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return {
      url,
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  /** A presigned GET that downloads the object as an attachment under `filename`. */
  async presignGet(key: string, filename: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Size of an object, or null if it does not exist. */
  async size(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** The first `length` bytes of an object. */
  async readStart(key: string, length: number): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
    );
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  }

  async read(key: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  }

  async copy(from: string, to: string, contentType: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${from}`,
        ContentType: contentType,
        MetadataDirective: "REPLACE",
      }),
    );
  }

  /** Deletes an object; deleting a missing object is not an error. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Deletes every object whose key starts with `prefix`; returns how many were deleted. */
  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith("/")) throw new Error("deletePrefix needs a folder prefix ending in /");
    let deleted = 0;
    for (;;) {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000 }),
      );
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
      if (keys.length === 0) return deleted;
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (result.Errors && result.Errors.length > 0) {
        throw new Error(`could not delete ${result.Errors.length} object(s) under a user prefix`);
      }
      deleted += keys.length;
    }
  }
}

/**
 * Makes the bucket usable by the app: creates it if missing (local stores only), allows browser
 * uploads from the web origin (CORS), and expires unconfirmed uploads. Idempotent.
 */
export async function setUpBucket(env: Env, client = createS3Client(env)): Promise<string[]> {
  const done: string[] = [];
  const bucket = env.S3_BUCKET;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    if (env.NODE_ENV === "production") {
      throw new Error(`bucket ${bucket} does not exist; create it with the storage provider`);
    }
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    done.push(`created bucket ${bucket}`);
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env.PUBLIC_WEB_URL],
            AllowedMethods: ["PUT"],
            AllowedHeaders: ["content-type"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  done.push(`CORS: PUT from ${env.PUBLIC_WEB_URL}`);
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "expire-unconfirmed-uploads",
            Status: "Enabled",
            Filter: { Prefix: QUARANTINE_PREFIX },
            Expiration: { Days: QUARANTINE_EXPIRY_DAYS },
          },
        ],
      },
    }),
  );
  done.push(`lifecycle: ${QUARANTINE_PREFIX}* expires after ${QUARANTINE_EXPIRY_DAYS} day`);
  return done;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFound ||
    (error instanceof S3ServiceException &&
      (error.$metadata.httpStatusCode === 404 || error.name === "NoSuchKey"))
  );
}
