'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export type LonLat = [number, number];
export type HinhHoc = { type: 'Point'; coordinates: LonLat } | { type: 'Polygon'; coordinates: LonLat[][] };

export interface Vung {
  id: string; code: string; name: string; kind: string; sector: string; officialCode: string | null; officialCodeIssuer: string | null; officialCodeValidUntil: string | null; maConHieuLuc: boolean; maChoDuyet: string | null;
  commune: string | null; district: string | null; province: string; active: boolean;
  chungNhan: { id: string; docType: string; number: string | null; expiresOn: string | null }[];
}
export interface Ho {
  id: string; code: string; fullName: string; cccd: string | null; coCccd: boolean; phone: string | null; commune: string | null; district: string | null;
  province: string; joinedOn: string | null; consentOn: string; source: string; voidedAt: string | null; voidReason: string | null;
}
export interface Thua {
  id: string; code: string; farmerId: string; growingAreaId: string; kind: string; crop: string | null; plantedYear: number | null;
  geometry: HinhHoc; geometryType: string; declaredAreaHa: number | null; measuredAreaHa: number | null; areaHa: number; gpsAccuracyM: number | null;
  landDocType: string | null; landDocNumber: string | null; warnings: string[]; source: string; forestStatus: string; tam: { lat: number; lon: number };
  voidedAt: string | null; voidReason: string | null;
}
export interface HoSoNguonCung {
  nhaCungCap: { id: string; code: string; name: string; country: string; kycStatus: string };
  duocSua: boolean;
  vung: Vung[];
  chungNhanChung: { id: string; docType: string; number: string | null; expiresOn: string | null }[];
  ho: Ho[];
  thua: Thua[];
}

export const LOAI_VUNG: Record<string, string> = { vung_trong: 'Vùng trồng', vung_nuoi: 'Vùng nuôi' };
export const LOAI_THUA: Record<string, string> = { thua: 'Thửa đất', ao: 'Ao nuôi' };
export const NGUON_NHAP: Record<string, string> = { noi_bo: 'Nhân viên nhập', cong_ncc: 'Nhà cung cấp nhập trên cổng', nhap_tep: 'Nhập từ tệp' };

export const TRANG_THAI_RUNG: Record<string, string> = { chua_kiem: 'Chưa kiểm', cho_duyet: 'Chờ duyệt', khong_rung: 'Không rừng', co_rung: 'Có rừng sau 2020' };
export const CACH_KIEM_RUNG: Record<string, string> = { jrc_2020: 'Bản đồ rừng 2020 của EU (JRC)', gfw: 'Global Forest Watch', khao_sat: 'Khảo sát thực địa', khac: 'Cách khác' };
export function NhanRung({ s }: { s: string }) {
  const cls = s === 'khong_rung' ? 'kyc-dat' : s === 'co_rung' ? 'kyc-canh-bao' : s === 'cho_duyet' ? 'canh-bao-nhe' : 'phu';
  return <span className={cls}>{TRANG_THAI_RUNG[s] ?? s}</span>;
}

export const ha = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha`);
export const banDo = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

/** Diện tích (ha) của ranh giới, cùng công thức với máy chủ, để hiện ngay khi đang đi quanh thửa. */
export function dienTichHa(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const r = [...ring, ring[0]];
  const rad = (d: number) => (d * Math.PI) / 180;
  const n = r.length;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = r[i];
    const p2 = r[(i + 1) % (n - 1)];
    const p3 = r[(i + 2) % (n - 1)];
    total += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs((total * 6378137 * 6378137) / 2) / 10_000;
}

/**
 * Hình vẽ các thửa theo đúng vị trí tương đối (không cần bản đồ nền, xem được khi mất mạng).
 * Thửa có ranh giới vẽ đa giác; thửa một điểm vẽ chấm tròn. Bấm vào thửa để chọn.
 */
export function HinhThua({ thua, chon, onChon }: { thua: Thua[]; chon?: string | null; onChon?: (id: string) => void }) {
  const ds = thua.filter((t) => !t.voidedAt);
  if (ds.length === 0) return <p className="phu">Chưa có thửa nào có tọa độ.</p>;
  const pts = ds.flatMap((t) => (t.geometry.type === 'Point' ? [t.geometry.coordinates] : t.geometry.coordinates[0]));
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const minX = Math.min(...lons) * k;
  const maxX = Math.max(...lons) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const span = Math.max(maxX - minX, maxY - minY, 0.0005);
  const W = 640;
  const H = 360;
  const pad = 24;
  const s = Math.min((W - 2 * pad) / span, (H - 2 * pad) / span);
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const X = (lon: number) => ox + (lon * k - minX) * s;
  const Y = (lat: number) => H - (oy + (lat - minY) * s);
  const metPerPx = (span * 111_320) / ((Math.min(W, H) - 2 * pad) || 1);
  const thuoc = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((v) => v / metPerPx >= 60) ?? 10000;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="hinh-thua" role="img" aria-label="Vị trí các thửa">
        {ds.map((t) => {
          const dangChon = t.id === chon;
          const canhBao = t.warnings.length > 0;
          const cls = `thua-ve${dangChon ? ' thua-chon' : ''}${canhBao ? ' thua-canh-bao' : ''}`;
          return (
            <g key={t.id} className={cls} onClick={() => onChon?.(t.id)} style={{ cursor: onChon ? 'pointer' : undefined }}>
              <title>{`${t.code} · ${ha(t.areaHa)}${canhBao ? ' · có cảnh báo' : ''}`}</title>
              {t.geometry.type === 'Point' ? (
                <circle cx={X(t.geometry.coordinates[0])} cy={Y(t.geometry.coordinates[1])} r={dangChon ? 8 : 6} />
              ) : (
                <polygon points={t.geometry.coordinates[0].map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} />
              )}
            </g>
          );
        })}
        <g className="thuoc-do">
          <line x1={pad} x2={pad + thuoc / metPerPx} y1={H - 12} y2={H - 12} />
          <text x={pad} y={H - 18}>{thuoc >= 1000 ? `${thuoc / 1000} km` : `${thuoc} m`}</text>
        </g>
      </svg>
      <figcaption className="phu">Chấm tròn: thửa ghi một điểm (≤ 4 ha). Hình đa giác: thửa có ranh giới. Màu cam: có cảnh báo cần kiểm tra.</figcaption>
    </figure>
  );
}

/** Đọc tệp GeoJSON người dùng chọn, trả về danh sách đối tượng. */
export async function docGeojson(file: File): Promise<unknown[]> {
  const text = await file.text();
  const data = JSON.parse(text) as { type?: string; features?: unknown[] };
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) return data.features;
  if (data.type === 'Feature') return [data];
  throw new Error('Tệp không phải GeoJSON dạng FeatureCollection');
}

/** Tải tệp GeoJSON về máy. */
export async function taiGeojson(path: string, ten: string) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Không tải được tệp');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ten}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Lấy tọa độ bằng điện thoại ----------

export interface ViTri { lon: number; lat: number; saiSoM: number }

/** Lấy một vị trí GPS; chờ tối đa 30 giây để có độ chính xác tốt. */
export function layViTri(): Promise<ViTri> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Thiết bị không có định vị'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lon: p.coords.longitude, lat: p.coords.latitude, saiSoM: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? 'Chưa cho phép trang này dùng vị trí. Mở cài đặt trình duyệt để cho phép.' : 'Chưa lấy được vị trí, ra chỗ thoáng rồi thử lại')),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  });
}

// ---------- Hàng chờ gửi khi mất sóng ----------

const KHOA_CHO = 'vt-thua-cho-gui';

export interface ThuaCho { tam: string; body: Record<string, unknown>; luc: string }

export function docHangCho(): ThuaCho[] {
  try {
    return JSON.parse(localStorage.getItem(KHOA_CHO) ?? '[]') as ThuaCho[];
  } catch {
    return [];
  }
}

function ghiHangCho(ds: ThuaCho[]) {
  try {
    localStorage.setItem(KHOA_CHO, JSON.stringify(ds));
  } catch {
    /* bộ nhớ trình duyệt bị chặn: bỏ qua */
  }
}

export function themHangCho(body: Record<string, unknown>) {
  ghiHangCho([...docHangCho(), { tam: `${Date.now()}`, body, luc: new Date().toISOString() }]);
}

/** Gửi lần lượt các thửa đang chờ. Thửa bị máy chủ từ chối được bỏ khỏi hàng chờ và trả lý do để nhập lại. */
export async function guiHangCho(): Promise<{ daGui: number; loi: string[] }> {
  const ds = docHangCho();
  const conLai: ThuaCho[] = [];
  const loi: string[] = [];
  let daGui = 0;
  for (const x of ds) {
    try {
      await api('/cong/nguon-cung/thua', { body: x.body });
      daGui++;
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) conLai.push(x);
      else loi.push((e as Error).message);
    }
  }
  ghiHangCho(conLai);
  return { daGui, loi };
}

/** Số thửa đang chờ gửi, tự gửi lại khi có mạng. */
export function useHangCho(onDaGui: () => void) {
  const [so, setSo] = useState(0);
  const cb = useRef(onDaGui);
  cb.current = onDaGui;
  useEffect(() => {
    setSo(docHangCho().length);
    const thu = async () => {
      if (!navigator.onLine || docHangCho().length === 0) return;
      const r = await guiHangCho();
      setSo(docHangCho().length);
      if (r.daGui) cb.current();
    };
    thu();
    window.addEventListener('online', thu);
    return () => window.removeEventListener('online', thu);
  }, []);
  return { so, capNhat: () => setSo(docHangCho().length) };
}
