'use client';

import { TRANG_THAI_KYC } from './nhan';

export interface DoiTac {
  id: string;
  code: string;
  name: string;
  country: string;
  taxCode: string | null;
  address: string | null;
  category: string;
  roles: string[];
  ownerUserId: string | null;
  ownerName: string | null;
  kycStatus: string;
  riskRating: string | null;
  screeningNote: string | null;
  kycSubmittedBy: string | null;
  kycApprovedAt: string | null;
  kycExpiresAt: string | null;
  kycRejectReason: string | null;
}

export function NhanKyc({ s }: { s: string }) {
  const cls = s === 'dat' ? 'kyc-dat' : s === 'het_han' || s === 'tu_choi' ? 'kyc-canh-bao' : '';
  return <span className={cls}>{TRANG_THAI_KYC[s] ?? s}</span>;
}

