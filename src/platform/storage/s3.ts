import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageDriver, StorageMetadata } from "./types";

export function createS3Storage(config: {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}): StorageDriver {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: !!config.endpoint,
  });

  return {
    async upload(key: string, data: Buffer, metadata: StorageMetadata) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: metadata.contentType,
        })
      );
    },

    async download(key: string) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key })
      );
      const stream = response.Body;
      if (!stream) throw new Error(`File not found: ${key}`);
      return Buffer.from(await stream.transformToByteArray());
    },

    async delete(key: string) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
      );
    },

    async getUrl(key: string) {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}
