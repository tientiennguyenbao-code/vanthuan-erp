import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
interface Ma { id: string; vungId: string; ma: string; trangThai: string; tep: { ten: string } | null; duocDuyetDong: boolean; ghiChuDuyet: string | null }

const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({ soLuong, donVi: 'tan', dungSaiPhanTram: 5, donGia: 6200, tienTe: 'USD', tyGiaUsd: null, incoterms: 'FOB', cangDi: 'Cát Lái', cangDen: null, lichGiao: 'Tháng 1/2027', dieuKhoanThanhToan: 'L/C trả ngay', tyLePhiPhanTram: 1.5, ghiChu: null, ...over });
const pdf = (t: string) => Buffer.from(`%PDF-1.4\n${t}\n%%EOF`);

describe('Đối chiếu mã số vùng trồng: gửi kèm bản scan, người thứ hai duyệt, truy xuất chỉ tính mã đã duyệt còn hiệu lực', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let tm: Agent;
  let tm2: Agent;
  let htx: Agent;
  let ncc: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], country: string) {
    const id = (await nv.post('/api/doi-tac').send({ code: `MV${Date.now() % 100000}${++n}`, name: `Đối tác MV ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201)).body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  const list = async (a: Agent = tm, q = '') => (await a.get(`/api/ma-vung${q}`).expect(200)).body as { duocDuyet: boolean; duocGui: boolean; ma: Ma[] };
  const vung = async () => (await tm.get(`/api/nguon-cung/${ncc}`).expect(200)).body.vung.find((v: { id: string }) => v.id === ids.vung) as { officialCode: string | null; maChoDuyet: string | null; officialCodeValidUntil: string | null };

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'mvnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'mvtp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'mvtm'))).agent;
    tm2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'mvtm2'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    ids.vung = (await tm.post(`/api/nguon-cung/${ncc}/vung`).send({ name: 'Vùng tiêu Chư Pưh', kind: 'vung_trong', sector: 'gia_vi', officialCode: 'GL-HT-0101', officialCodeIssuer: 'Chi cục Trồng trọt Gia Lai', province: 'Gia Lai' }).expect(201)).body.id;
    const email = uniqueEmail('htxmv');
    const r = await nv.post(`/api/doi-tac/${ncc}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán HTX' }).expect(201);
    htx = (await fullFirstLogin(app, { email, password: r.body.matKhauTam })).agent;
  });

  afterAll(async () => {
    await app.close();
  });

  it('mã ghi lúc tạo vùng chỉ là lần gửi chờ duyệt; chưa có bản scan thì không duyệt được; người gửi không tự duyệt', async () => {
    expect(await vung()).toMatchObject({ officialCode: null, maChoDuyet: 'GL-HT-0101' });
    const s = (await list(tm, `?nhaCungCap=${ncc}`)).ma[0];
    expect(s).toMatchObject({ ma: 'GL-HT-0101', trangThai: 'cho_duyet', tep: null });
    ids.s1 = s.id;
    await tp.post(`/api/ma-vung/${s.id}/duyet`).send({ dongY: true }).expect(400);
    await tm.post(`/api/ma-vung/${s.id}/duyet`).send({ dongY: true }).expect(403); // thu mua không có quyền duyệt
    await nv.post(`/api/ma-vung/${s.id}/tep`).attach('tep', pdf('giay'), 'giay.pdf').expect(403);
    await tm.post(`/api/ma-vung/${s.id}/tep`).attach('tep', Buffer.from('MZ không phải pdf'), 'giay.pdf').expect(400);
    await tm.post(`/api/ma-vung/${s.id}/tep`).attach('tep', pdf('giay chung nhan'), 'Giấy chứng nhận mã số vùng.pdf').expect(201);

    // Trưởng phòng tự gửi thì không tự duyệt
    const own = (await tp.post('/api/ma-vung').send({ vungId: ids.vung, ma: 'GL-HT-0102' }).expect(201)).body.id;
    await tp.post(`/api/ma-vung/${own}/tep`).attach('tep', pdf('x'), 'x.pdf').expect(201);
    expect((await tp.post(`/api/ma-vung/${own}/duyet`).send({ dongY: true }).expect(400)).body.message).toMatch(/không tự duyệt/);
    // Lần gửi trước của vùng đã bị thay
    expect((await list(tm, `?nhaCungCap=${ncc}`)).ma.find((x) => x.id === ids.s1)!.trangThai).toBe('thay_the');
    await tp.post(`/api/ma-vung/${ids.s1}/duyet`).send({ dongY: true }).expect(400);
    // Người khác từ chối, phải có lý do
    await (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'mvgd'))).agent.post(`/api/ma-vung/${own}/duyet`).send({ dongY: false, ghiChu: 'Số trên giấy khác mã ghi' }).expect(200);
    expect(await vung()).toMatchObject({ officialCode: null, maChoDuyet: null });
  });

  it('HTX gửi trên cổng, nhân viên xem bản scan và duyệt; mã thành mã của vùng', async () => {
    const r = await htx.post('/api/cong/ma-vung').send({ vungId: ids.vung, ma: 'GL-HT-0101', noiCap: 'Chi cục Trồng trọt Gia Lai', ngayCap: '2025-03-01', hieuLucDen: '2030-03-01', phamVi: 'Xuất khẩu sang Trung Quốc' }).expect(201);
    await htx.post(`/api/cong/ma-vung/${r.body.id}/tep`).attach('tep', pdf('ban scan HTX'), 'scan.pdf').expect(201);
    const d = await list(tp, '?trangThai=cho_duyet');
    const s = d.ma.find((x) => x.id === r.body.id)!;
    expect(d.duocDuyet).toBe(true);
    expect(s.duocDuyetDong).toBe(true);
    const link = (await tp.post(`/api/ma-vung/${s.id}/lien-ket`).expect(200)).body.duongDan as string;
    expect((await tp.get(link).expect(200)).body.toString()).toContain('ban scan HTX');
    await tm.get(link).expect(403); // đường dẫn gắn với người xin
    await tp.post(`/api/ma-vung/${s.id}/duyet`).send({ dongY: true }).expect(200);
    expect(await vung()).toMatchObject({ officialCode: 'GL-HT-0101', officialCodeValidUntil: '2030-03-01', maChoDuyet: null });
    // HTX thấy kết quả, không thấy nút duyệt
    const c = (await htx.get('/api/cong/ma-vung').expect(200)).body;
    expect(c.duocDuyet).toBe(false);
    expect(c.ma.find((x: Ma) => x.id === s.id).trangThai).toBe('da_duyet');
    ids.s2 = s.id;
  });

  it('truy xuất lô đi Trung Quốc tính mã đã duyệt; mã hết hạn hoặc bị thu hồi thì không tính', async () => {
    const buyer = await partner(['nguoi_mua'], 'CN');
    const mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TIEUMV${Date.now() % 100000}`, name: 'Tiêu đen', sector: 'gia_vi', hsCode: '090411' }).expect(201)).body.id;
    const signed = async (body: Record<string, unknown>) => {
      const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
      await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
      const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'mvgdk'));
      await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
      return c.body.id as string;
    };
    const ho = (await tm.post(`/api/nguon-cung/${ncc}/ho`).send({ fullName: 'Siu H Lan', province: 'Gia Lai', consentOn: '2026-11-01' }).expect(201)).body.id;
    const thua = (await tm.post(`/api/nguon-cung/${ncc}/thua`).send({ farmerId: ho, growingAreaId: ids.vung, kind: 'thua', crop: 'Tiêu', geometry: { type: 'Point', coordinates: [108.2, 13.6] }, declaredAreaHa: 1 }).expect(201)).body.id;
    const lm = (await nv.post('/api/lo-mua').send({ hopDongId: await signed({ loai: 'moi_gioi', benBanId: ncc, dieuKhoan: terms(5) }) }).expect(201)).body.id;
    await tm.post(`/api/lo-mua/${lm}/phieu-thu-gom`).send({ farmerId: ho, plotId: thua, harvestDate: '2026-11-10', quantityKg: 1000 }).expect(201);
    await nv.post(`/api/lo-mua/${lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 1000 }).expect(200);
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyer, dieuKhoan: terms(1, { tyLePhiPhanTram: null }) }), thiTruong: 'CN' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: lm, khoiLuongKg: 1000 }).expect(201);
    const maSoVung = async () => {
      const r = (await nv.get(`/api/lo-xuat/${lx}/truy-xuat`).expect(200)).body;
      return { dat: r.kiemTra.find((k: { ma: string }) => k.ma === 'ma_so_vung').dat as boolean, nguon: r.nguon[0] as { maSoVung: string | null; maSoVungHetHan: boolean } };
    };
    expect(await maSoVung()).toEqual({ dat: true, nguon: expect.objectContaining({ maSoVung: 'GL-HT-0101', maSoVungHetHan: false }) });

    // Mã mới hết hạn: không duyệt được
    const old = (await tm2.post('/api/ma-vung').send({ vungId: ids.vung, ma: 'GL-HT-0103', ngayCap: '2020-01-01', hieuLucDen: '2021-01-01' }).expect(201)).body.id;
    await tm2.post(`/api/ma-vung/${old}/tep`).attach('tep', pdf('cu'), 'cu.pdf').expect(201);
    expect((await tp.post(`/api/ma-vung/${old}/duyet`).send({ dongY: true }).expect(400)).body.message).toMatch(/hết hạn/);

    await tm.post(`/api/ma-vung/${ids.s2}/thu-hoi`).send({ lyDo: 'Cục thu hồi' }).expect(403);
    await tp.post(`/api/ma-vung/${ids.s2}/thu-hoi`).send({ lyDo: 'Cơ quan cấp đã thu hồi mã' }).expect(200);
    expect(await maSoVung()).toEqual({ dat: false, nguon: expect.objectContaining({ maSoVung: null }) });
  });
});
