import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from '../config/config';

export const FILE_STORE = Symbol('FILE_STORE');

/** Nơi cất tệp đã mã hoá. Hiện lưu trên đĩa máy chủ; khi chạy thật đổi sang kho chuẩn S3 (có khoá chống xoá) mà không đổi nghiệp vụ. */
export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export class LocalFileStore implements FileStore {
  private readonly root = resolve(loadConfig().FILE_DIR);

  private path(key: string) {
    if (!/^[a-z0-9/-]+$/.test(key)) throw new Error('Khoá tệp không hợp lệ');
    return join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    // wx: không ghi đè tệp đã có
    await writeFile(p, data, { flag: 'wx' });
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
}
