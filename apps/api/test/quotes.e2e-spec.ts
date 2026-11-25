import { INestApplication } from '@nestjs/common';
import { createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const later = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

describe('Báo giá', () => {
  let app: INestApplication;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let ktt: Agent;
  let ncc1: string;
  let ncc2: string;
  let nccChuaDuyet: string;
  let buyer: string;
  let mh: string;
  let n = 0;

  async function partner(roles: string[], approve = true) {
    const res = await nv.post('/api/doi-tac').send({ code: `BG${Date.now() % 100000}${++n}`, name: `Đối tác báo giá ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    if (approve) {
      await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
      await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
      await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    }
    return id;
  }

  const muaBody = (doiTacId: string, over: Record<string, unknown> = {}) => ({
    loai: 'mua',
    doiTacId,
    matHangId: mh,
    soLuong: 20,
    donVi: 'tan',
    donGia: 112_000_000,
    tienTe: 'VND',
    tyGiaUsd: 25400,
    incoterms: 'EXW',
    hieuLucDen: later(10),
    quyCach: 'Robusta loại 2, sàng 13',
    chungNhan: 'VietGAP',
    thoiGianGiao: 'Tháng 1/2027',
    thanhToan: 'Đặt cọc 30%',
    ...over,
  });

  async function sentQuote(body: Record<string, unknown>, by: Agent = nv) {
    const r = await by.post('/api/bao-gia').send(body).expect(201);
    await by.post(`/api/bao-gia/${r.body.id}/gui`).expect(200);
    return r.body.id as string;
  }

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bgnv'))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bgnv2'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'bgtp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'bgktt'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    nccChuaDuyet = await partner(['nha_cung_cap'], false);
    buyer = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `BGROB${Date.now() % 100000}`, name: 'Cà phê Robusta loại 2', sector: 'ca_phe' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('lập báo giá mua: có số, trạng thái soạn; sai vai đối tác thì báo lỗi', async () => {
    const r = await nv.post('/api/bao-gia').send(muaBody(ncc1)).expect(201);
    expect(r.body.code).toMatch(/^BGM-\d{4}-\d{4}$/);
    const g = await nv.get(`/api/bao-gia/${r.body.id}`).expect(200);
    expect(g.body).toMatchObject({ status: 'nhap', version: 1, giaTri: 2_240_000_000, hetHieuLuc: false });
    const bad = await nv.post('/api/bao-gia').send(muaBody(buyer)).expect(400);
    expect(bad.body.message).toMatch(/nhà cung cấp/);
  });

  it('so sánh báo giá mua: rẻ nhất (USD/kg) lên đầu, bỏ báo giá hết hạn và đã huỷ', async () => {
    const mh2 = (await tp.post('/api/danh-muc/mat-hang').send({ code: `SS${Date.now() % 100000}`, name: 'Tiêu đen 500', sector: 'gia_vi' }).expect(201)).body.id;
    const a = await sentQuote(muaBody(ncc1, { matHangId: mh2, donGia: 120_000_000 }));
    const b = await sentQuote(muaBody(ncc2, { matHangId: mh2, donGia: 4600, tienTe: 'USD', tyGiaUsd: null }));
    await nv.post('/api/bao-gia').send(muaBody(ncc2, { matHangId: mh2, donGia: 1, hieuLucDen: '2020-01-01' })).expect(201);
    const c = await sentQuote(muaBody(ncc1, { matHangId: mh2, donGia: 2 }));
    await nv.post(`/api/bao-gia/${c}/huy`).send({ lyDo: 'Nhà cung cấp rút' }).expect(200);
    const res = await nv.get(`/api/bao-gia/so-sanh?matHangId=${mh2}`).expect(200);
    expect(res.body.baoGia.map((q: { id: string }) => q.id)).toEqual([b, a]);
    expect(res.body.baoGia[0].usdMoiKg).toBeCloseTo(4.6, 2);
    expect(res.body.baoGia[1].usdMoiKg).toBeCloseTo(4.72, 2);
  });

  it('không gửi báo giá đã quá hiệu lực; báo giá đã gửi thì không sửa, phải lập sửa đổi', async () => {
    const r = await nv.post('/api/bao-gia').send(muaBody(ncc1, { hieuLucDen: '2020-01-01' })).expect(201);
    await nv.post(`/api/bao-gia/${r.body.id}/gui`).expect(400);
    const { loai: _l, ...upd } = muaBody(ncc1);
    void _l;
    await nv.put(`/api/bao-gia/${r.body.id}`).send(upd).expect(200);
    await nv.post(`/api/bao-gia/${r.body.id}/gui`).expect(200);
    await nv.put(`/api/bao-gia/${r.body.id}`).send({ ...upd, donGia: 1 }).expect(400);
    await nv.post(`/api/bao-gia/${r.body.id}/sua-doi`).expect(200);
    const g = await nv.get(`/api/bao-gia/${r.body.id}`).expect(200);
    expect(g.body).toMatchObject({ status: 'nhap', version: 2 });
  });

  it('nhân viên chỉ thấy báo giá của mình; kế toán trưởng xem được', async () => {
    const id = (await nv.post('/api/bao-gia').send(muaBody(ncc1)).expect(201)).body.id;
    await nv2.get(`/api/bao-gia/${id}`).expect(403);
    await nv2.post(`/api/bao-gia/${id}/gui`).expect(403);
    await ktt.get(`/api/bao-gia/${id}`).expect(200);
    await ktt.post('/api/bao-gia').send(muaBody(ncc1)).expect(403);
  });

  it('báo giá bán: gợi ý chi phí theo Incoterms, tính biên dự kiến', async () => {
    const src = await sentQuote(muaBody(ncc1));
    const r = await nv
      .post('/api/bao-gia')
      .send({ loai: 'ban', doiTacId: buyer, matHangId: mh, baoGiaNguonId: src, soLuong: 19.2, donVi: 'tan', donGia: 4850, tienTe: 'USD', incoterms: 'CIF', cangDi: 'Cát Lái', cangDen: 'Long Beach', hieuLucDen: later(7), tyLePhiPhanTram: 1.5 })
      .expect(201);
    let g = await nv.get(`/api/bao-gia/${r.body.id}`).expect(200);
    expect(g.body.chiPhiGoiY).toEqual(['van_tai_noi_dia', 'thu_tuc_xuat_khau', 'xep_hang', 'cuoc_bien', 'bao_hiem']);
    await nv
      .put(`/api/bao-gia/${r.body.id}/chi-phi`)
      .send({ dong: [{ loai: 'van_tai_noi_dia', soTien: 15_000_000, tienTe: 'VND', tyGiaUsd: 25000 }, { loai: 'cuoc_bien', soTien: 1800, tienTe: 'USD' }, { loai: 'bao_hiem', soTien: 150, tienTe: 'USD' }] })
      .expect(200);
    g = await nv.get(`/api/bao-gia/${r.body.id}`).expect(200);
    expect(g.body.chiPhiGoiY).toEqual(['thu_tuc_xuat_khau', 'xep_hang']);
    expect(g.body.tomTat).toMatchObject({ giaTriBanUsd: 93120, chiPhiUsd: 2550, phiTronGoiUsd: 1396.8, thieu: [] });
    expect(g.body.tomTat.giaVonUsd).toBeCloseTo(84661.42, 1);
    expect(g.body.nguon.id).toBe(src);
  });

  it('báo giá nguồn phải là báo giá mua cùng mặt hàng', async () => {
    const ban = (await nv.post('/api/bao-gia').send({ loai: 'ban', doiTacId: buyer, matHangId: mh, soLuong: 1, donVi: 'tan', donGia: 1, tienTe: 'USD', incoterms: 'FOB', hieuLucDen: later(5) }).expect(201)).body.id;
    const res = await nv.post('/api/bao-gia').send({ loai: 'ban', doiTacId: buyer, matHangId: mh, baoGiaNguonId: ban, soLuong: 1, donVi: 'tan', donGia: 1, tienTe: 'USD', incoterms: 'FOB', hieuLucDen: later(5) }).expect(400);
    expect(res.body.message).toMatch(/báo giá mua/);
  });

  it('chấp nhận báo giá bán (mua đứt) sinh cặp hợp đồng mua và bán; phí trọn gói ghi trên hợp đồng mua', async () => {
    const src = await sentQuote(muaBody(ncc1));
    const ban = await sentQuote({ loai: 'ban', doiTacId: buyer, matHangId: mh, baoGiaNguonId: src, soLuong: 19.2, donVi: 'tan', donGia: 4850, tienTe: 'USD', incoterms: 'FOB', hieuLucDen: later(7), thoiGianGiao: 'Tàu chạy tháng 2/2027', thanhToan: 'L/C trả ngay', tyLePhiPhanTram: 1.5 });
    const res = await nv.post(`/api/bao-gia/${ban}/chap-nhan`).send({ loaiGiaoDich: 'mua_dut' }).expect(200);
    expect(res.body.hopDong.map((h: { kind: string }) => h.kind)).toEqual(['mua', 'ban']);
    const [mua, banHd] = res.body.hopDong;
    const m = await nv.get(`/api/hop-dong/${mua.id}`).expect(200);
    expect(m.body).toMatchObject({ status: 'nhap', kind: 'mua', sellerPartnerId: ncc1 });
    expect(m.body.terms).toMatchObject({ soLuong: 20, donGia: 112_000_000, tienTe: 'VND', tyGiaUsd: 25400, tyLePhiPhanTram: 1.5 });
    const b = await nv.get(`/api/hop-dong/${banHd.id}`).expect(200);
    expect(b.body).toMatchObject({ kind: 'ban', buyerPartnerId: buyer });
    expect(b.body.terms).toMatchObject({ donGia: 4850, lichGiao: 'Tàu chạy tháng 2/2027', dieuKhoanThanhToan: 'L/C trả ngay', tyLePhiPhanTram: null });
    const q = await nv.get(`/api/bao-gia/${ban}`).expect(200);
    expect(q.body.status).toBe('chap_nhan');
    expect(q.body.hopDong).toHaveLength(2);
    expect((await nv.get(`/api/bao-gia/${src}`).expect(200)).body.status).toBe('chap_nhan');
    // Không chấp nhận lại lần nữa
    await nv.post(`/api/bao-gia/${ban}/chap-nhan`).send({}).expect(400);
  });

  it('chấp nhận theo môi giới sinh hợp đồng mua bán trực tiếp và hợp đồng dịch vụ môi giới', async () => {
    const src = await sentQuote(muaBody(ncc2));
    const ban = await sentQuote({ loai: 'ban', doiTacId: buyer, matHangId: mh, baoGiaNguonId: src, soLuong: 18, donVi: 'tan', donGia: 4800, tienTe: 'USD', incoterms: 'FOB', hieuLucDen: later(7), tyLePhiPhanTram: 2 });
    const res = await nv.post(`/api/bao-gia/${ban}/chap-nhan`).send({ loaiGiaoDich: 'moi_gioi' }).expect(200);
    expect(res.body.hopDong.map((h: { kind: string }) => h.kind)).toEqual(['mua_ban_truc_tiep', 'moi_gioi']);
    const mg = await nv.get(`/api/hop-dong/${res.body.hopDong[1].id}`).expect(200);
    expect(mg.body.terms.tyLePhiPhanTram).toBe(2);
    expect(mg.body.dealType).toBe('moi_gioi');
  });

  it('không sinh hợp đồng khi nhà cung cấp chưa thẩm định đạt; không để lại gì nửa vời', async () => {
    const q = await sentQuote(muaBody(nccChuaDuyet));
    const before = (await tp.get('/api/hop-dong').expect(200)).body.hopDong.length;
    const res = await nv.post(`/api/bao-gia/${q}/chap-nhan`).send({}).expect(400);
    expect(res.body.message).toMatch(/thẩm định/);
    expect((await tp.get('/api/hop-dong').expect(200)).body.hopDong.length).toBe(before);
    expect((await nv.get(`/api/bao-gia/${q}`).expect(200)).body.status).toBe('da_gui');
  });

  it('báo giá bị từ chối ghi lý do và sửa đổi được', async () => {
    const q = await sentQuote(muaBody(ncc1));
    await nv.post(`/api/bao-gia/${q}/tu-choi`).send({ lyDo: 'Giá cao hơn thị trường' }).expect(200);
    const g = await nv.get(`/api/bao-gia/${q}`).expect(200);
    expect(g.body).toMatchObject({ status: 'tu_choi', rejectReason: 'Giá cao hơn thị trường' });
    await nv.post(`/api/bao-gia/${q}/sua-doi`).expect(200);
  });
});
