'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ngayGio } from './nhan';

interface Dot { id: string; code: string; rowCount: number; fileSha256: string; createdAt: string; createdByName: string }

async function luuTep(res: Response, tenMacDinh: string) {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Không xuất được tệp');
  }
  const ten = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? tenMacDinh;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = ten;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return ten;
}

/** Kế toán: lập đợt xuất các đề nghị thu phí đã duyệt sang tệp Excel để nhập vào MISA AMIS. */
export function XuatMisa({ sauKhiXuat }: { sauKhiXuat: () => void }) {
  const [choXuat, setChoXuat] = useState(0);
  const [dot, setDot] = useState<Dot[]>([]);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [dangXuat, setDangXuat] = useState(false);

  const tai = useCallback(async () => {
    const r = await api<{ choXuat: number; dotXuat: Dot[] }>('/xuat-misa');
    setChoXuat(r.choXuat);
    setDot(r.dotXuat);
  }, []);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function xuat() {
    setLoi('');
    setTb('');
    setDangXuat(true);
    try {
      const ten = await luuTep(await fetch('/api/xuat-misa/phi-tron-goi', { method: 'POST', credentials: 'same-origin' }), 'misa.xlsx');
      await tai();
      sauKhiXuat();
      setTb(`Đã tải về ${ten}. Các đề nghị trong tệp được ghi "đã chuyển kế toán" và không xuất lại lần sau.`);
    } catch (e) {
      setLoi((e as Error).message);
    } finally {
      setDangXuat(false);
    }
  }

  async function taiLai(d: Dot) {
    setLoi('');
    try {
      await luuTep(await fetch(`/api/xuat-misa/${d.id}/tep`, { credentials: 'same-origin' }), `${d.code}.xlsx`);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  return (
    <div className="o" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Chuyển sang MISA AMIS</h2>
      <p>
        Đề nghị đã duyệt chưa chuyển: <strong>{choXuat}</strong>.{' '}
        <button className="nho" disabled={!choXuat || dangXuat} onClick={xuat}>{dangXuat ? 'Đang xuất…' : 'Xuất tệp Excel'}</button>
      </p>
      <p className="phu">Mỗi lần xuất lập một đợt có mã riêng; mỗi đề nghị chỉ nằm trong một đợt. Mở tệp, kiểm tra rồi nhập vào AMIS (Bán hàng, nhập khẩu từ Excel).</p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      {dot.length > 0 && (
        <div className="bang-cuon">
          <table>
            <thead><tr><th>Đợt</th><th>Số dòng</th><th>Lúc, người xuất</th><th></th></tr></thead>
            <tbody>
              {dot.map((d) => (
                <tr key={d.id}>
                  <td>{d.code}<div className="phu" title={d.fileSha256}>mã băm {d.fileSha256.slice(0, 12)}…</div></td>
                  <td>{d.rowCount}</td>
                  <td>{ngayGio(d.createdAt)}<div className="phu">{d.createdByName}</div></td>
                  <td><button className="phu-btn nho" onClick={() => taiLai(d)}>Tải lại</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
