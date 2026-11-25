import { createHash } from 'node:crypto';
import { merkleProof, merkleRoot, verifyMerkleProof } from './merkle';

const leaf = (i: number) => createHash('sha256').update(`la-${i}`).digest('hex');

describe('Cây Merkle', () => {
  it('một lá: mã gốc là băm của lá, đường đi rỗng', () => {
    const l = [leaf(1)];
    expect(merkleProof(l, 0)).toEqual([]);
    expect(verifyMerkleProof(l[0], [], merkleRoot(l))).toBe(true);
  });

  it.each([2, 3, 5, 8, 13])('%i lá: đường đi của mọi lá đều dẫn về đúng mã gốc', (n) => {
    const leaves = Array.from({ length: n }, (_, i) => leaf(i));
    const root = merkleRoot(leaves);
    leaves.forEach((l, i) => expect(verifyMerkleProof(l, merkleProof(leaves, i), root)).toBe(true));
  });

  it('đổi một lá thì mã gốc đổi và đường đi cũ không còn khớp', () => {
    const leaves = Array.from({ length: 6 }, (_, i) => leaf(i));
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 2);
    const tampered = [...leaves];
    tampered[2] = leaf(99);
    expect(merkleRoot(tampered)).not.toBe(root);
    expect(verifyMerkleProof(leaf(99), proof, root)).toBe(false);
  });

  it('không giả được nút trong thành lá', () => {
    const leaves = [leaf(1), leaf(2), leaf(3), leaf(4)];
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 0);
    // Lấy nút trong (băm của lá 1 và 2) làm "lá" với phần đường đi còn lại
    const inner = proof[0];
    expect(verifyMerkleProof(inner.hash, proof.slice(1), root)).toBe(false);
  });

  it('báo lỗi khi không có lá hoặc lá sai dạng', () => {
    expect(() => merkleRoot([])).toThrow();
    expect(() => merkleRoot(['khong-phai-ma-bam'])).toThrow();
  });
});
