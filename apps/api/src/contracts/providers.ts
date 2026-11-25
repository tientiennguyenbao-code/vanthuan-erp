import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../config/config';

/**
 * Hai "ổ cắm" thay được: chữ ký số và nơi neo mã gốc.
 * Bản này dùng loại nội bộ để chạy thử trọn quy trình; khi có hợp đồng dịch vụ MISA eSign
 * và ví blockchain công khai thì chỉ cần viết loại mới theo cùng giao diện, không đổi dữ liệu cũ.
 */

export interface SignatureResult {
  provider: string;
  value: string;
}

export interface SignatureProvider {
  readonly name: string;
  sign(input: { contentHash: string; signerUserId: string; signedAt: Date }): Promise<SignatureResult>;
  verify(input: { contentHash: string; signerUserId: string; signedAt: Date }, value: string): boolean;
}

export interface AnchorProvider {
  readonly name: string;
  /** Ghi mã gốc ra ngoài; trả về mã giao dịch (null nếu chỉ lưu nội bộ). */
  publish(root: string): Promise<{ txRef: string | null }>;
}

export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER');
export const ANCHOR_PROVIDER = Symbol('ANCHOR_PROVIDER');

/**
 * Chữ ký nội bộ TẠM THỜI: máy chủ ký bằng khoá riêng suy ra từ APP_KEY, ràng buộc mã băm hợp đồng,
 * người ký và thời điểm. Chứng minh được trong nội bộ nhưng chưa có giá trị pháp lý như chữ ký số;
 * thay bằng MISA eSign trước khi dùng với đối tác thật.
 */
export class InternalSignatureProvider implements SignatureProvider {
  readonly name = 'noi_bo_tam_thoi';

  private get key(): Buffer {
    const master = Buffer.from(loadConfig().APP_KEY, 'base64');
    return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'vanthuan/ky-hop-dong/v1', 32));
  }

  private mac(input: { contentHash: string; signerUserId: string; signedAt: Date }): string {
    return createHmac('sha256', this.key).update(`${input.contentHash}|${input.signerUserId}|${input.signedAt.toISOString()}`).digest('hex');
  }

  async sign(input: { contentHash: string; signerUserId: string; signedAt: Date }): Promise<SignatureResult> {
    return { provider: this.name, value: this.mac(input) };
  }

  verify(input: { contentHash: string; signerUserId: string; signedAt: Date }, value: string): boolean {
    const expected = Buffer.from(this.mac(input), 'hex');
    const got = Buffer.from(value, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  }
}

/** Neo nội bộ: lưu mã gốc trong cơ sở dữ liệu (chỉ ghi thêm), chưa ghi ra blockchain công khai. */
export class InternalAnchorProvider implements AnchorProvider {
  readonly name = 'noi_bo';
  async publish(): Promise<{ txRef: string | null }> {
    return { txRef: null };
  }
}
