/**
 * Truy xuất nguồn gốc theo cặp ngành × thị trường: mức truy xuất tối thiểu và các điểm phải kiểm trước khi lô xuất
 * qua cổng chứng từ. Bảng này lấy từ bản thiết kế phân hệ Nguồn cung; các điểm về quy định nước nhập là hiểu biết
 * chung, CHƯA đối chiếu văn bản gốc, nên mọi điểm (trừ việc truy được nguồn) mang cờ "cần xác minh".
 */

export const FACILITY_SCHEMES = ['fda', 'gacc', 'eu_list'] as const;
export type FacilityScheme = (typeof FACILITY_SCHEMES)[number];
export const FACILITY_SCHEME_LABEL: Record<FacilityScheme, string> = {
  fda: 'Mã FDA (Mỹ)',
  gacc: 'Mã GACC (Trung Quốc)',
  eu_list: 'Mã trong danh sách cơ sở được xuất vào EU',
};

export type CheckKey = 'truy_nguon' | 'eudr' | 'thuoc_bvtv' | 'ma_so_vung' | 'iuu' | 'simp' | FacilityScheme;

export interface MarketRule {
  /** Mức truy xuất tối thiểu, như bảng trong thiết kế */
  muc: string;
  kiem: CheckKey[];
}

export const TRACE_RULES: Record<string, Record<string, MarketRule>> = {
  ca_phe: {
    EU: { muc: 'Từng thửa', kiem: ['truy_nguon', 'eudr'] },
    US: { muc: 'Nhà cung cấp và cơ sở', kiem: ['fda'] },
    CN: { muc: 'Nhà cung cấp và cơ sở', kiem: ['gacc'] },
  },
  gia_vi: {
    EU: { muc: 'Vùng trồng', kiem: ['truy_nguon', 'thuoc_bvtv'] },
    US: { muc: 'Nhà cung cấp và cơ sở', kiem: ['fda'] },
    CN: { muc: 'Vùng trồng và cơ sở', kiem: ['gacc', 'ma_so_vung'] },
  },
  thuy_san: {
    EU: { muc: 'Ao nuôi hoặc tàu khai thác', kiem: ['truy_nguon', 'ma_so_vung', 'iuu', 'eu_list'] },
    US: { muc: 'Ao nuôi hoặc tàu khai thác', kiem: ['fda', 'simp'] },
    CN: { muc: 'Ao nuôi và cơ sở', kiem: ['gacc', 'ma_so_vung'] },
  },
};

export function ruleFor(sector: string, market: string): MarketRule | null {
  return TRACE_RULES[sector]?.[market] ?? null;
}

/**
 * Loài thuộc chương trình SIMP của Mỹ (theo hiểu biết chung, cần xác minh danh sách hiện hành): so theo tên
 * mặt hàng hoặc loài nuôi, không phân biệt hoa thường.
 */
export const SIMP_KEYWORDS = ['tôm', 'shrimp', 'cá ngừ', 'tuna', 'cá kiếm', 'swordfish', 'cua huỳnh đế', 'king crab', 'hải sâm', 'sea cucumber', 'cá tuyết', 'cod', 'cá hồng', 'snapper', 'cá mú', 'grouper', 'cá nục heo', 'mahi', 'cá mập', 'shark', 'bào ngư', 'abalone'];

export function isSimpSpecies(...names: (string | null | undefined)[]): boolean {
  const t = names.filter(Boolean).join(' ').toLowerCase();
  return SIMP_KEYWORDS.some((k) => t.includes(k));
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const vn = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/**
 * Thu hoạch khi chưa hết thời gian cách ly của lần phun thuốc gần trước đó: hàng có nguy cơ vượt dư lượng tối đa.
 * Trả về các lưu ý (rỗng là ổn). Không chặn ghi phiếu, vì hàng vẫn có thể bán ở thị trường khác sau khi kiểm dư lượng.
 */
export function phiIssues(sprays: { sprayedOn: string; product: string; phiDays: number }[], harvestDate: string): string[] {
  return sprays
    .filter((s) => s.sprayedOn <= harvestDate && harvestDate < addDays(s.sprayedOn, s.phiDays))
    .map((s) => `Thu hoạch ngày ${vn(harvestDate)} khi chưa hết ${s.phiDays} ngày cách ly sau lần phun ${s.product} ngày ${vn(s.sprayedOn)}`);
}

export interface CheckResult {
  ma: CheckKey;
  ten: string;
  dat: boolean;
  chiTiet: string[];
  canXacMinh: boolean;
}

export interface TraceFacts {
  /** Tổng kg phân bổ vào lô xuất */
  tongKg: number;
  /** Phần kg truy được tới thửa, ao hoặc chuyến khai thác qua phiếu thu gom */
  truyDuocKg: number;
  loMua: { ma: string; eudrClass: string | null; coCoSo: boolean }[];
  nguon: { ma: string; maSoVung: string | null; coNhatKyThuoc: boolean; luuY: string[] }[];
  /** Chuyến khai thác góp hàng, với điểm còn thiếu về IUU và SIMP */
  chuyen?: { ma: string; thieuIuu: string[]; thieuSimp: string[] }[];
  /** Mã còn hiệu lực theo loại, của mọi cơ sở đã xử lý hàng của lô */
  maCoSo: Partial<Record<FacilityScheme, string[]>>;
  /** Cơ sở thiếu mã theo loại */
  coSoThieu: Partial<Record<FacilityScheme, string[]>>;
  simp: boolean;
}

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

function facilityCheck(scheme: FacilityScheme, f: TraceFacts): CheckResult {
  const lotsWithout = f.loMua.filter((l) => !l.coCoSo).map((l) => l.ma);
  const thieu = f.coSoThieu[scheme] ?? [];
  const chiTiet: string[] = [];
  if (lotsWithout.length) chiTiet.push(`Lô mua chưa ghi xưởng sơ chế hay kho: ${lotsWithout.join(', ')}`);
  if (thieu.length) chiTiet.push(`Cơ sở chưa có mã còn hiệu lực: ${thieu.join(', ')}`);
  if (!chiTiet.length) chiTiet.push(`Mã: ${(f.maCoSo[scheme] ?? []).join(', ')}`);
  return { ma: scheme, ten: FACILITY_SCHEME_LABEL[scheme], dat: lotsWithout.length === 0 && thieu.length === 0 && f.loMua.length > 0, chiTiet, canXacMinh: true };
}

/** Kiểm từng điểm của cặp ngành × thị trường trên dữ liệu đã gom của một lô xuất. */
export function traceChecks(rule: MarketRule, f: TraceFacts): CheckResult[] {
  const allTraced = f.tongKg > 0 && f.truyDuocKg + 0.5 >= f.tongKg;
  const chuyen = f.chuyen ?? [];
  const soNguon = [f.nguon.length ? `${f.nguon.length} thửa/ao` : '', chuyen.length ? `${chuyen.length} chuyến khai thác` : ''].filter(Boolean).join(', ');
  return rule.kiem.map((k): CheckResult => {
    switch (k) {
      case 'truy_nguon':
        return {
          ma: k,
          ten: 'Mọi kg truy được tới thửa, ao hoặc chuyến khai thác qua phiếu thu gom',
          dat: allTraced,
          chiTiet: f.tongKg === 0 ? ['Lô xuất chưa có hàng phân bổ'] : allTraced ? [`${soNguon} góp hàng`] : [`Mới truy được ${fmt(f.truyDuocKg)} / ${fmt(f.tongKg)} kg; phần còn lại ghi tay, không theo phiếu`],
          canXacMinh: false,
        };
      case 'eudr': {
        const not = f.loMua.filter((l) => l.eudrClass !== 'du').map((l) => l.ma);
        return { ma: k, ten: 'Hàng đủ EUDR, có gói dữ liệu EUDR', dat: f.loMua.length > 0 && not.length === 0, chiTiet: not.length ? [`Lô mua chưa có nhãn đủ EUDR: ${not.join(', ')}`] : ['Chốt gói ở mục Gói dữ liệu EUDR'], canXacMinh: false };
      }
      case 'thuoc_bvtv': {
        const noLog = f.nguon.filter((n) => !n.coNhatKyThuoc).map((n) => n.ma);
        const phi = f.nguon.flatMap((n) => n.luuY.map((x) => `${n.ma}: ${x}`));
        return {
          ma: k,
          ten: 'Nhật ký thuốc BVTV của các thửa, không thu hoạch trong thời gian cách ly (đối chiếu dư lượng tối đa)',
          dat: f.nguon.length > 0 && noLog.length === 0 && phi.length === 0,
          chiTiet: [...(noLog.length ? [`Thửa chưa có nhật ký thuốc trong 12 tháng trước thu hoạch: ${noLog.join(', ')}`] : []), ...phi, ...(f.nguon.length === 0 ? ['Chưa có thửa nào góp hàng qua phiếu thu gom'] : [])],
          canXacMinh: true,
        };
      }
      case 'ma_so_vung': {
        if (f.nguon.length === 0 && chuyen.length > 0)
          return { ma: k, ten: 'Mã số vùng trồng / mã cơ sở nuôi do cơ quan nhà nước cấp, đã đối chiếu giấy chứng nhận', dat: true, chiTiet: ['Hàng khai thác, không có ao nuôi; giấy khai thác kiểm ở mục riêng'], canXacMinh: true };
        const thieu = f.nguon.filter((n) => !n.maSoVung).map((n) => n.ma);
        return {
          ma: k,
          ten: 'Mã số vùng trồng / mã cơ sở nuôi do cơ quan nhà nước cấp, đã đối chiếu giấy chứng nhận',
          dat: f.nguon.length > 0 && thieu.length === 0,
          chiTiet: f.nguon.length === 0 ? ['Chưa có thửa hay ao nào góp hàng qua phiếu thu gom'] : thieu.length ? [`Vùng của các thửa/ao sau chưa có mã đã duyệt còn hiệu lực: ${thieu.join(', ')}`] : ['Mọi vùng góp hàng có mã đã duyệt, còn hiệu lực'],
          canXacMinh: true,
        };
      }
      case 'iuu': {
        const thieu = chuyen.flatMap((c) => c.thieuIuu.map((x) => `${c.ma}: ${x}`));
        return {
          ma: k,
          ten: 'Hàng khai thác có giấy chứng nhận khai thác, tàu có giấy phép (chống khai thác IUU)',
          dat: thieu.length === 0,
          chiTiet: chuyen.length === 0 ? ['Không có hàng khai thác trong lô'] : thieu.length ? thieu : [`${chuyen.length} chuyến đều có giấy`],
          canXacMinh: true,
        };
      }
      case 'simp':
        if (!f.simp) return { ma: k, ten: 'Dữ liệu SIMP cho người nhập Mỹ', dat: true, chiTiet: ['Loài này không thuộc danh sách SIMP theo phần mềm'], canXacMinh: true };
      {
        const aoThieu = f.nguon.filter((n) => !n.maSoVung).map((n) => n.ma);
        const chuyenThieu = chuyen.flatMap((c) => c.thieuSimp.map((x) => `${c.ma}: ${x}`));
        const chiTiet = allTraced
          ? [
              ...(aoThieu.length ? [`Ao chưa có mã cơ sở nuôi đã duyệt còn hiệu lực: ${aoThieu.join(', ')}`] : []),
              ...chuyenThieu,
            ]
          : [`Mới truy được ${fmt(f.truyDuocKg)} / ${fmt(f.tongKg)} kg tới ao nuôi hoặc chuyến khai thác`];
        return {
          ma: k,
          ten: 'Dữ liệu SIMP cho người nhập Mỹ: nơi nuôi hoặc nơi đánh bắt của mọi kg',
          dat: allTraced && aoThieu.length === 0 && chuyenThieu.length === 0,
          chiTiet: chiTiet.length ? chiTiet : ['Mọi ao có mã cơ sở nuôi đã duyệt, mọi chuyến có đủ dữ liệu tàu và giấy phép'],
          canXacMinh: true,
        };
      }
      default:
        return facilityCheck(k, f);
    }
  });
}
