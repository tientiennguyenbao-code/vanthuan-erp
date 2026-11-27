'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  BuyerPayment,
  COMPLAINT_KIND_EN,
  dateEn,
  DOC_STATUS_EN,
  MARKET_EN,
  money,
  PaymentsTable,
  SAMPLE_EN,
  SAMPLE_STATUS_EN,
  STAGE_EN,
  STATUS_EN,
  tons,
} from '@/lib/nguoi-mua';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

interface Doc {
  id: string;
  name: string;
  stage: string;
  status: string;
  number: string | null;
  issuedOn: string | null;
  files: { id: string; version: number; name: string; size: number; sha256: string; uploadedAt: string }[];
  lastReview: { decision: 'dong_y' | 'yeu_cau_sua'; comment: string | null; by: string; at: string } | null;
  canReview: boolean;
}
interface Detail {
  id: string;
  code: string;
  contractCode: string;
  shipmentNo: number;
  plannedKg: number | null;
  dealType: string;
  status: string;
  market: string;
  commodityName: string;
  etd: string | null;
  eta: string | null;
  blNumber: string | null;
  shippedOn: string | null;
  vessel: string | null;
  carrier: string | null;
  bookingNumber: string | null;
  shipper: string;
  traceability: { growingAreaCodes: { code: string; province: string; kind: string }[]; packingFacilityCodes: string[] };
  documents: Doc[];
  samples: { code: string; kind: string; status: string; courier: string | null; trackingNo: string | null; sentOn: string | null; resultOn: string | null; cupScore: number | null; resultNote: string | null }[];
  priceFixations: { fixedOn: string; quantityKg: number; futuresPrice: number; differential: number; finalPrice: number }[];
  averageFixedPrice: number | null;
  fixedKg: number;
  payments: BuyerPayment[];
  complaints: { code: string; kind: string; description: string; claimedAmount: number | null; currency: string; status: string; openedAt: string; agreedAmount: number | null; resolution: string | null; closedAt: string | null }[];
  canComplain: boolean;
}

const STEPS = ['dong_goi', 'nhap_kho', 'giam_dinh', 'dat_cho', 'xep_tau', 'hoan_tat'];

function Review({ doc, onDone }: { doc: Doc; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  async function send(approve: boolean) {
    setErr('');
    try {
      await api(`/cong-nguoi-mua/chung-tu/${doc.id}/y-kien`, { body: { dongY: approve, noiDung: comment || null } });
      setOpen(false);
      setComment('');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  if (!open) return <button className="nho" onClick={() => setOpen(true)}>Review draft</button>;
  return (
    <div style={{ marginTop: 6 }}>
      <textarea aria-label="Comment" rows={2} placeholder="Comments (required if you need changes)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="nho" onClick={() => send(true)}>Approve</button>{' '}
      <button className="nho phu-btn" onClick={() => send(false)}>Request changes</button>{' '}
      <button className="nho phu-btn" onClick={() => setOpen(false)}>Cancel</button>
      {err && <div className="loi" role="alert">{err}</div>}
    </div>
  );
}

function ClaimForm({ lotId, onDone }: { lotId: string; onDone: () => void }) {
  const [f, setF] = useState({ loai: 'chat_luong', moTa: '', soTienYeuCau: '', bangChung: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      const r = await api<{ code: string }>(`/lo-xuat/${lotId}/khieu-nai`, {
        body: { loai: f.loai, moTa: f.moTa, soTienYeuCau: f.soTienYeuCau ? Number(f.soTienYeuCau) : null, bangChung: f.bangChung || null },
      });
      setOk(`Claim ${r.code} has been opened. Our team will contact you.`);
      setF({ loai: 'chat_luong', moTa: '', soTienYeuCau: '', bangChung: '' });
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }
  return (
    <form className="o" onSubmit={submit}>
      <div className="hang">
        <div>
          <label htmlFor="ckind">Type</label>
          <select id="ckind" value={f.loai} onChange={(e) => setF({ ...f, loai: e.target.value })}>
            {Object.entries(COMPLAINT_KIND_EN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="camt">Amount claimed (optional)</label>
          <input id="camt" type="number" min="0" step="0.01" value={f.soTienYeuCau} onChange={(e) => setF({ ...f, soTienYeuCau: e.target.value })} />
        </div>
      </div>
      <label htmlFor="cdesc">What happened</label>
      <textarea id="cdesc" required rows={3} value={f.moTa} onChange={(e) => setF({ ...f, moTa: e.target.value })} />
      <label htmlFor="cev">Evidence (survey report number, link, photos reference)</label>
      <input id="cev" value={f.bangChung} onChange={(e) => setF({ ...f, bangChung: e.target.value })} />
      <button>Open claim</button>
      {ok && <div className="dat" role="status">{ok}</div>}
      {err && <div className="loi" role="alert">{err}</div>}
    </form>
  );
}

export default function BuyerShipment() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api<Detail>(`/cong-nguoi-mua/lo/${id}`).then(setD).catch((e: Error) => setErr(e.message)), [id]);
  useEffect(() => {
    if (toi) load();
  }, [toi, load]);
  async function openFile(fileId: string) {
    try {
      const r = await api<{ duongDan: string }>(`/tep/${fileId}/lien-ket`, { method: 'POST' });
      window.open(r.duongDan, '_blank', 'noopener');
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  if (!toi) return null;
  const step = d ? STEPS.indexOf(d.status) : -1;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/nguoi-mua">← My contracts and shipments</Link></p>
      {err && <div className="loi" role="alert">{err}</div>}
      {d && (
        <>
          <h1>Shipment {d.code} <span className="nhan">{STATUS_EN[d.status] ?? d.status}</span></h1>
          <p className="phu">
            {d.commodityName} · {MARKET_EN[d.market] ?? d.market} · contract {d.contractCode}
            {d.plannedKg ? ` · shipment ${d.shipmentNo}, ${tons(d.plannedKg)}` : ''}
          </p>
          <ol className="buoc-lo" style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, flexWrap: 'wrap' }}>
            {STEPS.map((s, i) => (
              <li key={s} className={i <= step ? 'nhan kyc-dat' : 'nhan phu'}>{i + 1}. {STATUS_EN[s]}</li>
            ))}
          </ol>

          <div className="luoi">
            <div className="o">
              <strong>Shipping</strong>
              <div>Shipper: {d.shipper}</div>
              <div>Carrier: {d.carrier ?? '—'}{d.bookingNumber ? ` · booking ${d.bookingNumber}` : ''}</div>
              <div>Vessel / voyage: {d.vessel ?? '—'}</div>
              <div>ETD {dateEn(d.etd)} · ETA {dateEn(d.eta)}</div>
              <div>B/L: {d.blNumber ?? '—'}{d.shippedOn ? ` · shipped on board ${dateEn(d.shippedOn)}` : ''}</div>
            </div>
            <div className="o">
              <strong>Traceability</strong>
              <div className="phu" style={{ fontSize: 13 }}>Official registration codes of the origin areas and packing facilities.</div>
              <div>Growing / farming area codes: {d.traceability.growingAreaCodes.length ? d.traceability.growingAreaCodes.map((a) => `${a.code} (${a.province})`).join(', ') : '—'}</div>
              <div>Packing facility codes: {d.traceability.packingFacilityCodes.length ? d.traceability.packingFacilityCodes.join(', ') : '—'}</div>
            </div>
          </div>

          <h2>Documents</h2>
          <p className="phu">Drafts appear here before they are finalised. Please approve them or tell us what to change.</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Document</th><th>Status</th><th>Files</th><th>Your review</th></tr></thead>
              <tbody>
                {d.documents.map((x) => (
                  <tr key={x.id}>
                    <td>{x.name}<div className="phu">{STAGE_EN[x.stage] ?? x.stage}</div></td>
                    <td>
                      <span className={x.status === 'da_gui' || x.status === 'da_duyet' ? 'kyc-dat' : ''}>{DOC_STATUS_EN[x.status] ?? x.status}</span>
                      {x.number && <div className="phu">No. {x.number}{x.issuedOn ? `, ${dateEn(x.issuedOn)}` : ''}</div>}
                    </td>
                    <td>
                      {x.files.length === 0 && <span className="phu">—</span>}
                      {x.files.slice(0, 1).map((f) => (
                        <div key={f.id}>
                          <button type="button" className="lien-ket" onClick={() => openFile(f.id)} title={`SHA-256: ${f.sha256}`}>{f.name}</button>
                          <span className="phu"> v{f.version}</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      {x.lastReview && (
                        <div className={x.lastReview.decision === 'dong_y' ? 'kyc-dat' : 'kyc-canh-bao'}>
                          {x.lastReview.decision === 'dong_y' ? 'Approved' : 'Changes requested'}{x.lastReview.comment ? `: ${x.lastReview.comment}` : ''}
                          <div className="phu">{x.lastReview.by}, {dateEn(x.lastReview.at)}</div>
                        </div>
                      )}
                      {x.canReview && <Review doc={x} onDone={load} />}
                    </td>
                  </tr>
                ))}
                {d.documents.length === 0 && <tr><td colSpan={4} className="phu">No documents yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {d.samples.length > 0 && (
            <>
              <h2>Samples</h2>
              <div className="bang-cuon">
                <table>
                  <thead><tr><th>Sample</th><th>Status</th><th>Courier</th><th>Result</th></tr></thead>
                  <tbody>
                    {d.samples.map((s) => (
                      <tr key={s.code}>
                        <td>{s.code}<div className="phu">{SAMPLE_EN[s.kind] ?? s.kind}</div></td>
                        <td>{SAMPLE_STATUS_EN[s.status] ?? s.status}</td>
                        <td>{s.courier ? `${s.courier} ${s.trackingNo ?? ''}` : '—'}{s.sentOn && <div className="phu">sent {dateEn(s.sentOn)}</div>}</td>
                        <td>{s.resultOn ? dateEn(s.resultOn) : '—'}{s.cupScore !== null && <div>cup score {s.cupScore}</div>}{s.resultNote && <div className="phu">{s.resultNote}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {d.priceFixations.length > 0 && (
            <>
              <h2>Price fixations</h2>
              <p>Fixed {tons(d.fixedKg)}{d.averageFixedPrice !== null && <> · average <strong>{money(d.averageFixedPrice)} USD/t</strong></>}</p>
              <div className="bang-cuon">
                <table>
                  <thead><tr><th>Date</th><th>Quantity</th><th>Futures</th><th>Differential</th><th>Final price</th></tr></thead>
                  <tbody>
                    {d.priceFixations.map((f, i) => (
                      <tr key={i}><td>{dateEn(f.fixedOn)}</td><td>{tons(f.quantityKg)}</td><td>{money(f.futuresPrice)}</td><td>{f.differential >= 0 ? '+' : ''}{money(f.differential)}</td><td><strong>{money(f.finalPrice)} USD/t</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2>Payments</h2>
          <PaymentsTable rows={d.payments} />

          <h2>Claims</h2>
          {d.complaints.length > 0 && (
            <div className="bang-cuon">
              <table>
                <thead><tr><th>Claim</th><th>Type</th><th>Description</th><th>Claimed</th><th>Status</th></tr></thead>
                <tbody>
                  {d.complaints.map((c) => (
                    <tr key={c.code}>
                      <td>{c.code}<div className="phu">{dateEn(c.openedAt)}</div></td>
                      <td>{COMPLAINT_KIND_EN[c.kind] ?? c.kind}</td>
                      <td>{c.description}</td>
                      <td>{money(c.claimedAmount, c.currency)}</td>
                      <td>
                        {c.status === 'mo' ? 'Under review' : 'Closed'}
                        {c.status !== 'mo' && <div className="phu">agreed {money(c.agreedAmount, c.currency)}{c.resolution ? ` · ${c.resolution}` : ''}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.canComplain ? <ClaimForm lotId={d.id} onDone={load} /> : d.complaints.length === 0 && <p className="phu">Claims can be opened once the goods are shipped.</p>}
        </>
      )}
    </KhungTrang>
  );
}
