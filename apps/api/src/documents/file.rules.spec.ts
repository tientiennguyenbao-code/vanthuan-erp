import { randomBytes } from 'node:crypto';
import { decryptBytes, detectType, encryptBytes, LINK_TTL_MS, safeFileName, signLink, verifyLink } from './file.rules';

describe('tệp chứng từ', () => {
  it('nhận loại tệp theo nội dung, không theo tên', () => {
    expect(detectType(Buffer.from('%PDF-1.7\n...'))).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(detectType(Buffer.from('MZ\x90\x00 chương trình'))).toBeNull();
    expect(detectType(Buffer.from('<html>'))).toBeNull();
  });

  it('làm sạch tên tệp, giữ dấu tiếng Việt và đặt đuôi theo loại thật', () => {
    expect(safeFileName('../../etc/Hóa đơn số 12.exe', 'pdf')).toBe('Hóa đơn số 12.pdf');
    expect(safeFileName('C:\\scan\\phiếu<1>.PDF', 'pdf')).toBe('phiếu1.pdf');
    expect(safeFileName('', 'png')).toBe('tep.png');
  });

  it('mã hoá và giải mã; sửa một byte thì không giải mã được', () => {
    const key = randomBytes(32);
    const plain = Buffer.from('%PDF-1.4 nội dung chứng từ');
    const enc = encryptBytes(plain, key);
    expect(decryptBytes(enc, key).equals(plain)).toBe(true);
    enc[enc.length - 1] ^= 1;
    expect(() => decryptBytes(enc, key)).toThrow();
  });

  it('đường dẫn tải: đúng người, hết hạn sau 10 phút, không giả được', () => {
    const k = randomBytes(32);
    const now = Date.now();
    const t = signLink('f1', 'u1', now + LINK_TTL_MS, k);
    expect(verifyLink(t, k, now)).toEqual({ fileId: 'f1', userId: 'u1' });
    expect(verifyLink(t, k, now + LINK_TTL_MS + 1)).toBe('het_han');
    expect(verifyLink(t, randomBytes(32), now)).toBe('sai');
    const [b, s] = t.split('.');
    const forged = Buffer.from(Buffer.from(b, 'base64url').toString().replace('u1', 'u2')).toString('base64url');
    expect(verifyLink(`${forged}.${s}`, k, now)).toBe('sai');
  });
});
