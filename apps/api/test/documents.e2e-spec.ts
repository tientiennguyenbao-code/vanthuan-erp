import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
type Doc = { id: string; code: string; supplierPartnerId: string | null; status: string; requirement: string; stage: string; obsolete: boolean; quyen: Record<string, boolean> };

const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 4800,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: null,
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'L/C trả ngay',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});

describe('Chứng từ: checklist theo thị trường, cổng xếp tàu, đề nghị thu phí', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let ktt: Agent;
  let gd: Agent;
  let qt: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyer: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `CT${Date.now() % 100000}${++n}`, name: `Đối tác chứng từ ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }

  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdct'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }

  async function purchaseLot(contractId: string, kg: number) {
    const id = (await nv.post('/api/lo-mua').send({ hopDongId: contractId }).expect(201)).body.id as string;
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'so_che', khoiLuongKg: kg }).expect(200);
    return id;
  }

  const docs = async (a: Agent = nv) => (await a.get(`/api/lo-xuat/${ids.lx}/chung-tu`).expect(200)).body as { chungTu: Doc[]; thieuTruocXepTau: string[]; quyen: Record<string, boolean>; moChan: { daDung: boolean }[] };
  const active = (d: { chungTu: Doc[] }) => d.chungTu.filter((x) => !x.obsolete);
  const keys = (d: { chungTu: Doc[] }) =>
    active(d)
      .map((x) => `${x.code}:${x.supplierPartnerId === ncc1 ? 'ncc1' : x.supplierPartnerId === ncc2 ? 'ncc2' : '-'}`)
      .sort();
  const advance = (body: Record<string, unknown> = {}) => nv.post(`/api/lo-xuat/${ids.lx}/chuyen-buoc`).send(body);

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'ctnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'cttp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'ctktt'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'ctgd'))).agent;
    qt = (await fullFirstLogin(app, await createUser(app, ['QUAN_TRI_HE_THONG'], 'ctqt'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    buyer = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `CTROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;
    ids.mg1 = await signed({ loai: 'moi_gioi', benBanId: ncc1, dieuKhoan: terms(10) });
    ids.mg2 = await signed({ loai: 'moi_gioi', benBanId: ncc2, dieuKhoan: terms(5, { tyLePhiPhanTram: 2 }) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc1, benMuaId: buyer, dieuKhoan: terms(15, { tyLePhiPhanTram: null }) });
    ids.lm1 = await purchaseLot(ids.mg1, 10000);
    ids.lm2 = await purchaseLot(ids.mg2, 5000);
  });
  afterAll(async () => {
    await app.close();
  });

  it('quy tắc: nhóm rà soát xem và sửa; nhân viên chỉ xem; quản trị không xem', async () => {
    const eu = await nv.get('/api/quy-tac-chung-tu?thiTruong=EU&nganh=ca_phe').expect(200);
    const codes = eu.body.quyTac.map((r: { code: string }) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['hoa_don', 'eudr', 'eur1', 'van_don']));
    expect(codes).not.toContain('fda_dang_ky');
    await qt.get('/api/quy-tac-chung-tu').expect(403);
    const rule = { ma: 'chung_nhan_4c', ten: 'Chứng nhận 4C', nganh: 'ca_phe', thiTruong: 'EU', yeuCau: 'nm', giaiDoan: 'truoc_xep_tau', phamVi: 'nha_cung_cap', benLam: 'nha_cung_cap' };
    await nv.post('/api/quy-tac-chung-tu').send(rule).expect(403);
    await tp.post('/api/quy-tac-chung-tu').send({ ...rule, ma: 'Sai Ma' }).expect(400);
    ids.rule = (await tp.post('/api/quy-tac-chung-tu').send(rule).expect(201)).body.id;
    await ktt.post(`/api/quy-tac-chung-tu/${ids.rule}/da-ra-soat`).expect(204);
  });

  it('lô môi giới gom hai nhà cung cấp: chứng từ người xuất khẩu tách theo nhà cung cấp, thêm thỏa thuận ủy quyền', async () => {
    ids.lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.tt, thiTruong: 'EU', etd: '2027-01-20' }).expect(201)).body.id;
    expect(keys(await docs())).toEqual(['chung_thu_giam_dinh:-', 'eudr:-', 'eur1:-', 'hoa_don:-', 'kn_ota:-', 'phieu_dong_goi:-', 'to_khai_xk:-', 'van_don:-', 'chung_nhan_4c:-'].sort());
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 10000 }).expect(201);
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm2, khoiLuongKg: 5000 }).expect(201);
    const d = await docs();
    expect(keys(d)).toEqual(
      [
        'chung_thu_giam_dinh:-',
        'kn_ota:-',
        'van_don:-',
        'uy_quyen_ncc_chinh:-',
        ...['hoa_don', 'phieu_dong_goi', 'to_khai_xk', 'eur1', 'eudr', 'chung_nhan_4c'].flatMap((c) => [`${c}:ncc1`, `${c}:ncc2`]),
      ].sort(),
    );
    // Dòng chung trước khi có hàng được giữ lại để tra cứu, không xoá
    expect(d.chungTu.filter((x) => x.obsolete).map((x) => x.code)).toEqual(expect.arrayContaining(['hoa_don', 'eudr']));
    await qt.get(`/api/lo-xuat/${ids.lx}/chung-tu`).expect(403);
  });

  it('cập nhật và duyệt theo nguyên tắc 4 mắt; sửa sau khi duyệt phải duyệt lại', async () => {
    const hd = active(await docs()).find((x) => x.code === 'hoa_don' && x.supplierPartnerId === ncc1)!;
    await nv.put(`/api/chung-tu/${hd.id}`).send({ trangThai: 'nhap' }).expect(400);
    await nv.put(`/api/chung-tu/${hd.id}`).send({ trangThai: 'nhap', so: 'INV-001' }).expect(204);
    await nv.post(`/api/chung-tu/${hd.id}/duyet`).expect(403);
    await tp.post(`/api/chung-tu/${hd.id}/duyet`).expect(204);
    expect(active(await docs()).find((x) => x.id === hd.id)!.status).toBe('da_duyet');
    await nv.put(`/api/chung-tu/${hd.id}`).send({ trangThai: 'nhap', so: 'INV-001A' }).expect(204);
    const again = active(await docs(tp)).find((x) => x.id === hd.id)!;
    expect(again.status).toBe('nhap');
    expect(again.quyen.duyet).toBe(true);
    // Trưởng phòng tự cập nhật thì không tự duyệt
    const pk = active(await docs()).find((x) => x.code === 'phieu_dong_goi' && x.supplierPartnerId === ncc1)!;
    await tp.put(`/api/chung-tu/${pk.id}`).send({ trangThai: 'nhap', so: 'PL-001' }).expect(204);
    const self = await tp.post(`/api/chung-tu/${pk.id}/duyet`).expect(403);
    expect(self.body.message).toMatch(/4 mắt/);
    await tp.post(`/api/chung-tu/${pk.id}/tra-lai`).send({ lyDo: 'Sai trọng lượng tịnh' }).expect(204);
    expect(active(await docs()).find((x) => x.id === pk.id)).toMatchObject({ status: 'dang_xin', note: 'Trả lại: Sai trọng lượng tịnh' });
  });

  it('thiếu chứng từ thì chặn xếp tàu; Giám đốc mở chặn một lần, ghi lý do', async () => {
    for (const p of (await tp.get(`/api/lo-xuat/${ids.lx}`).expect(200)).body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    expect((await advance().expect(200)).body.status).toBe('nhap_kho');
    expect((await advance().expect(200)).body.status).toBe('giam_dinh');
    await nv.post(`/api/lo-xuat/${ids.lx}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'SGS' }).expect(200);
    await nv.put(`/api/lo-xuat/${ids.lx}/booking`).send({ hangTau: 'CMA CGM', soBooking: 'CMA778899', container: [{ so: 'CMAU1234567', chi: 'K-1' }] }).expect(200);
    expect((await advance().expect(200)).body.status).toBe('dat_cho');

    const ship = { soVanDon: 'CMA-BL-01', ngayTauChay: '2027-01-20' };
    const blocked = await advance(ship).expect(400);
    expect(blocked.body.message).toMatch(/chứng từ bắt buộc trước xếp tàu chưa được duyệt/);
    expect((await nv.get(`/api/lo-xuat/${ids.lx}`).expect(200)).body.thieuDeChuyen.join(' ')).toMatch(/chứng từ bắt buộc/);

    // Hết hạn trước ngày tàu chạy cũng bị chặn
    const eudr = active(await docs()).find((x) => x.code === 'eudr' && x.supplierPartnerId === ncc2)!;
    await nv.put(`/api/chung-tu/${eudr.id}`).send({ trangThai: 'nhap', so: 'EUDR-DDS-1', ngayCap: '2026-11-01', ngayHetHan: '2027-01-10' }).expect(204);
    expect((await docs()).thieuTruocXepTau.join(' ')).toMatch(/hết hạn trước ngày tàu chạy/);

    expect((await docs(gd)).quyen.moChan).toBe(true);
    await nv.post(`/api/lo-xuat/${ids.lx}/mo-chan`).send({ lyDo: 'Người mua đồng ý nhận bản sao' }).expect(403);
    await tp.post(`/api/lo-xuat/${ids.lx}/mo-chan`).send({ lyDo: 'Người mua đồng ý nhận bản sao' }).expect(403);
    await gd.post(`/api/lo-xuat/${ids.lx}/mo-chan`).send({ lyDo: 'x' }).expect(400);
    await gd.post(`/api/lo-xuat/${ids.lx}/mo-chan`).send({ lyDo: 'Người mua đồng ý nhận bản sao, bổ sung bản chính sau' }).expect(204);
    await gd.post(`/api/lo-xuat/${ids.lx}/mo-chan`).send({ lyDo: 'Lần hai' }).expect(400);
    expect((await advance(ship).expect(200)).body.status).toBe('xep_tau');
    expect((await docs()).moChan).toEqual([expect.objectContaining({ daDung: true })]);
  });

  it('xếp tàu tự lập đề nghị thu phí theo từng lô mua; Kế toán trưởng duyệt', async () => {
    const list = await nv.get(`/api/de-nghi-thu-phi?loXuatId=${ids.lx}`).expect(200);
    const byLot = Object.fromEntries(list.body.deNghi.map((f: { purchaseLotId: string }) => [f.purchaseLotId, f]));
    // 10 tấn × 4.800 USD/tấn × 1,5% ; 5 tấn × 4.800 × 2%
    expect(byLot[ids.lm1]).toMatchObject({ quantityKg: 10000, unitPricePerKg: 4.8, baseValue: 48000, ratePct: 1.5, amount: 720, currency: 'USD', amountUsd: 720, blNumber: 'CMA-BL-01', status: 'cho_duyet', coTheDuyet: false });
    expect(byLot[ids.lm2]).toMatchObject({ baseValue: 24000, ratePct: 2, amount: 480, supplierPartnerId: ncc2 });
    const f1 = byLot[ids.lm1].id;
    await nv.post(`/api/de-nghi-thu-phi/${f1}/duyet`).expect(403);
    await tp.post(`/api/de-nghi-thu-phi/${f1}/duyet`).expect(403);
    const k = await ktt.get('/api/de-nghi-thu-phi?trangThai=cho_duyet').expect(200);
    expect(k.body.deNghi.find((f: { id: string }) => f.id === f1).coTheDuyet).toBe(true);
    await ktt.post(`/api/de-nghi-thu-phi/${f1}/duyet`).expect(204);
    await ktt.post(`/api/de-nghi-thu-phi/${f1}/duyet`).expect(400);
    await qt.get('/api/de-nghi-thu-phi').expect(403);
  });

  it('hoàn tất cần mọi chứng từ bắt buộc đã gửi', async () => {
    const r = await advance().expect(400);
    expect(r.body.message).toMatch(/chưa gửi người mua hoặc ngân hàng/);
    for (const d of active(await docs(tp))) {
      if (d.requirement !== 'bb' || d.status === 'da_gui' || d.status === 'khong_ap_dung') continue;
      if (d.status === 'da_duyet') await nv.post(`/api/chung-tu/${d.id}/da-gui`).expect(204);
      else if (d.status === 'nhap') {
        await tp.post(`/api/chung-tu/${d.id}/duyet`).expect(204);
        await nv.post(`/api/chung-tu/${d.id}/da-gui`).expect(204);
      } else await tp.post(`/api/chung-tu/${d.id}/khong-ap-dung`).send({ lyDo: 'Gom vào bộ của nhà cung cấp chính' }).expect(204);
    }
    expect((await advance().expect(200)).body.status).toBe('hoan_tat');
    const hd = active(await docs()).find((x) => x.code === 'hoa_don' && x.supplierPartnerId === ncc1)!;
    await nv.put(`/api/chung-tu/${hd.id}`).send({ trangThai: 'nhap', so: 'X-1' }).expect(400);
  });
});
