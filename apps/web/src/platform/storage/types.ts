export interface StorageMetadata {
  contentType?: string;
  [key: string]: string | undefined;
}

export interface StorageDriver {
  upload(key: string, data: Buffer, metadata: StorageMetadata): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
