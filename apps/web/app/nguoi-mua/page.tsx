'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BuyerContract, BuyerPayment, dateEn, DEAL_EN, FUTURES_EN, MARKET_EN, money, PaymentsTable, STATUS_EN, tons, UNIT_EN } from '@/lib/nguoi-mua';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface BuyerLot {
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
  vessel: string | null;
  openComplaints: number;
  draftsToReview: number;
}
interface Overview {
  buyerName: string | null;
  contracts: BuyerContract[];
  lots: BuyerLot[];
  payments: BuyerPayment[];
  outstanding: { currency: string; amount: number }[];
}

export default function BuyerHome() {
  const toi = useToi();
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (toi) api<Overview>('/cong-nguoi-mua').then(setO).catch((e: Error) => setErr(e.message));
  }, [toi]);
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Welcome, {toi.hoTen}</h1>
      {o?.buyerName && <p className="phu">{o.buyerName} · contracts and shipments with Van Thuan Global</p>}
      {err && <div className="loi" role="alert">{err}</div>}

      {o && (
        <>
          <h2>Shipments</h2>
          {o.lots.length === 0 && <p className="phu">No shipments yet.</p>}
          <div className="luoi">
            {o.lots.map((l) => (
              <Link key={l.id} href={`/nguoi-mua/lo/${l.id}`} className="o the-lo">
                <strong>{l.code}</strong> <span className="nhan">{STATUS_EN[l.status] ?? l.status}</span>
                <div>{l.commodityName} · {MARKET_EN[l.market] ?? l.market}</div>
                <div className="phu">Contract {l.contractCode}{l.plannedKg ? ` · shipment ${l.shipmentNo}, ${tons(l.plannedKg)}` : ''}</div>
                <div className="phu">ETD {dateEn(l.etd)} · ETA {dateEn(l.eta)}{l.vessel ? ` · ${l.vessel}` : ''}</div>
                {l.blNumber && <div className="phu">B/L {l.blNumber}</div>}
                {l.draftsToReview > 0 && <div className="kyc-canh-bao">{l.draftsToReview} document draft{l.draftsToReview > 1 ? 's' : ''} for your review</div>}
                {l.openComplaints > 0 && <div className="kyc-canh-bao">{l.openComplaints} open claim{l.openComplaints > 1 ? 's' : ''}</div>}
              </Link>
            ))}
          </div>

          <h2>Payments</h2>
          {o.outstanding.length > 0 && (
            <p>Outstanding: {o.outstanding.map((x) => <strong key={x.currency} style={{ marginRight: 12 }}>{money(x.amount, x.currency)}</strong>)}</p>
          )}
          <PaymentsTable rows={o.payments} showLot />

          <h2>Signed contracts</h2>
          {o.contracts.length === 0 && <p className="phu">No signed contracts yet.</p>}
          {o.contracts.map((c) => (
            <div key={c.id} className="o" style={{ marginBottom: 12 }}>
              <strong>{c.code}</strong> <span className="nhan">{DEAL_EN[c.dealType] ?? c.dealType}</span>
              {c.version > 1 && <span className="nhan">amendment {c.version - 1}</span>}
              <div>
                {c.commodity.name}{c.commodity.hsCode ? ` (HS ${c.commodity.hsCode})` : ''} · seller: {c.seller}
              </div>
              <div className="bang-cuon">
                <table>
                  <tbody>
                    <tr><th>Quantity</th><td>{money(c.terms.quantity)} {UNIT_EN[c.terms.unit] ?? c.terms.unit} ± {c.terms.tolerancePct}%</td></tr>
                    <tr>
                      <th>Price</th>
                      <td>
                        {c.terms.differential
                          ? `${FUTURES_EN[c.terms.differential.market] ?? c.terms.differential.market} ${c.terms.differential.futuresMonth} ${c.terms.differential.differentialUsdPerTon >= 0 ? '+' : ''}${money(c.terms.differential.differentialUsdPerTon)} USD/t (provisional ${money(c.terms.unitPrice, c.terms.currency)}/${UNIT_EN[c.terms.unit] ?? c.terms.unit})`
                          : `${money(c.terms.unitPrice, c.terms.currency)} per ${UNIT_EN[c.terms.unit] ?? c.terms.unit}`}
                        {' '}{c.terms.incoterms} {c.terms.portOfLoading ?? ''}
                      </td>
                    </tr>
                    <tr><th>Destination</th><td>{c.terms.portOfDischarge ?? '—'}</td></tr>
                    <tr>
                      <th>Shipment</th>
                      <td>
                        {c.terms.shipmentSchedule}
                        {c.terms.instalments.length > 0 && <div className="phu">{c.terms.instalments.map((d, i) => `#${i + 1} ${d.month}: ${money(d.quantity)} ${UNIT_EN[c.terms.unit] ?? c.terms.unit}`).join(' · ')}</div>}
                      </td>
                    </tr>
                    <tr><th>Payment</th><td>{c.terms.paymentTerms}{c.terms.creditDays ? ` · ${c.terms.creditDays} days after shipment` : ''}</td></tr>
                    {c.terms.preShipmentSample && <tr><th>Sample</th><td>Pre-shipment sample approval required before loading</td></tr>}
                    <tr><th>Signed</th><td>{dateEn(c.signedAt)}</td></tr>
                  </tbody>
                </table>
              </div>
              {c.verificationCode && (
                <div className="phu" style={{ marginTop: 6, fontSize: 13 }}>
                  Verification code: <code style={{ wordBreak: 'break-all' }}>{c.verificationCode}</code>
                  <br />Compare this code with the one on your signed copy at <Link href="/xac-minh">the verification page</Link>. Any change to the contract changes the code.
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </KhungTrang>
  );
}
