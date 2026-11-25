import { createHash } from 'node:crypto';

/**
 * Cây Merkle để gom nhiều mã băm thành một mã gốc duy nhất, đem neo lên blockchain.
 * Theo cách của RFC 6962: lá và nút trong được băm với tiền tố khác nhau (0x00 và 0x01)
 * để không ai giả được một nút trong thành một lá. Tầng có số lẻ phần tử thì phần tử
 * cuối được đưa thẳng lên tầng trên (không nhân đôi).
 */

export interface ProofStep {
  /** Mã băm của nút anh em (hex). */
  hash: string;
  /** Nút anh em nằm bên trái hay bên phải. */
  side: 'trai' | 'phai';
}

function h(prefix: number, ...parts: Buffer[]): Buffer {
  const hash = createHash('sha256');
  hash.update(Buffer.from([prefix]));
  for (const p of parts) hash.update(p);
  return hash.digest();
}

function leaf(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Lá cây Merkle phải là mã băm SHA-256 dạng hex');
  return h(0x00, Buffer.from(hex, 'hex'));
}

function levels(leaves: string[]): Buffer[][] {
  if (leaves.length === 0) throw new Error('Không có mã băm nào để gom');
  const out: Buffer[][] = [leaves.map(leaf)];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? h(0x01, cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: string[]): string {
  const lv = levels(leaves);
  return lv[lv.length - 1][0].toString('hex');
}

/** Đường đi từ lá thứ `index` lên gốc: ai có đường đi này tự kiểm được mà không cần các lá khác. */
export function merkleProof(leaves: string[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error('Vị trí lá không hợp lệ');
  const lv = levels(leaves);
  const proof: ProofStep[] = [];
  let i = index;
  for (let d = 0; d < lv.length - 1; d++) {
    const cur = lv[d];
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < cur.length) proof.push({ hash: cur[sibling].toString('hex'), side: i % 2 === 0 ? 'phai' : 'trai' });
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyMerkleProof(leafHex: string, proof: ProofStep[], rootHex: string): boolean {
  let acc: Buffer;
  try {
    acc = leaf(leafHex);
  } catch {
    return false;
  }
  for (const step of proof) {
    const sib = Buffer.from(step.hash, 'hex');
    acc = step.side === 'phai' ? h(0x01, acc, sib) : h(0x01, sib, acc);
  }
  return acc.toString('hex') === rootHex;
}
