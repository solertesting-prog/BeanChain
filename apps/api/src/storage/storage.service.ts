import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { AppConfig } from '../config/app-config';

/**
 * Almacenamiento de ficheros. `local` para desarrollo, `s3` (o compatible:
 * Cloudflare R2, MinIO, Scaleway…) para producción.
 */
@Injectable()
export class StorageService {
  private readonly s3?: S3Client;

  constructor(private readonly config: AppConfig) {
    if (config.storage.driver === 's3') {
      this.s3 = new S3Client({
        region: config.storage.s3Region,
        endpoint: config.storage.s3Endpoint,
        forcePathStyle: Boolean(config.storage.s3Endpoint),
        credentials: config.storage.s3AccessKeyId
          ? { accessKeyId: config.storage.s3AccessKeyId, secretAccessKey: config.storage.s3SecretAccessKey }
          : undefined,
      });
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.config.storage.s3Bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const file = this.localPath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.config.storage.s3Bucket, Key: key }));
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as Readable) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    return fs.readFile(this.localPath(key));
  }

  private localPath(key: string): string {
    const base = path.resolve(this.config.storage.localDir);
    const file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep)) throw new Error('Ruta de almacenamiento no válida');
    return file;
  }
}
