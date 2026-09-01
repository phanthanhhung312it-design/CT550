const { products, blogPosts, orders, users, employees } = require('./seedData');

function timestamp(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

const customerAddressRows = [
  { dc_ma: 1, user_ma: 2, dc_hoten: 'Phan Thanh Hung', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 1', dc_macdinh: 1, created_at: timestamp() },
  { dc_ma: 6, user_ma: 2, dc_hoten: 'Phan Thanh Hung', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 3', dc_macdinh: 0, dc_diachi: '98 Võ Văn Tần, Quận 3, TP. Hồ Chí Minh', dc_dienthoai: '0901000002', created_at: timestamp() },
  { dc_ma: 7, user_ma: 2, dc_hoten: 'Phan Thanh Hung', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Bình Thạnh', dc_macdinh: 0, dc_diachi: '215 Phạm Văn Đồng, Bình Thạnh, TP. Hồ Chí Minh', dc_dienthoai: '0901000002', created_at: timestamp() },
  { dc_ma: 2, user_ma: 5, dc_hoten: 'Nguyen Minh Anh', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 3', dc_macdinh: 1, created_at: timestamp() },
  { dc_ma: 8, user_ma: 5, dc_hoten: 'Nguyen Minh Anh', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Phú Nhuận', dc_macdinh: 0, dc_diachi: '12 Hoa Sứ, Phú Nhuận, TP. Hồ Chí Minh', dc_dienthoai: '0903000005', created_at: timestamp() },
  { dc_ma: 3, user_ma: 6, dc_hoten: 'Le Bao Chau', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 1', dc_macdinh: 1, created_at: timestamp() },
  { dc_ma: 9, user_ma: 6, dc_hoten: 'Le Bao Chau', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Thủ Đức', dc_macdinh: 0, dc_diachi: '44 Xa Lộ Hà Nội, Thủ Đức, TP. Hồ Chí Minh', dc_dienthoai: '0903000006', created_at: timestamp() },
  { dc_ma: 4, user_ma: 7, dc_hoten: 'Tran Gia Khanh', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 3', dc_macdinh: 1, created_at: timestamp() },
  { dc_ma: 10, user_ma: 7, dc_hoten: 'Tran Gia Khanh', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Quận 10', dc_macdinh: 0, dc_diachi: '76 Sư Vạn Hạnh, Quận 10, TP. Hồ Chí Minh', dc_dienthoai: '0903000007', created_at: timestamp() },
  { dc_ma: 5, user_ma: 8, dc_hoten: 'Vo Quynh Nhu', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Phú Nhuận', dc_macdinh: 1, created_at: timestamp() },
  { dc_ma: 11, user_ma: 8, dc_hoten: 'Vo Quynh Nhu', dc_tinh: 'TP. Hồ Chí Minh', dc_quanhuyen: 'Gò Vấp', dc_macdinh: 0, dc_diachi: '31 Nguyễn Oanh, Gò Vấp, TP. Hồ Chí Minh', dc_dienthoai: '0903000008', created_at: timestamp() },
];

const paymentMethodIdByName = {
  COD: 1,
  MOMO: 2,
  VNPay: 3,
};

const addressIdByUserId = customerAddressRows.reduce((map, item) => {
  map[item.user_ma] = item.dc_ma;
  return map;
}, {});

const donhangRows = orders.map((order, index) => ({
  dh_ma: order.orderNumber || order.id,
  user_ma: order.userId || 2,
  diachigiaohang_ma: addressIdByUserId[order.userId] || 1,
  nv_uly: index % 2 === 0 ? 1 : 2,
  vc_ma: order.vc_ma || 0,
  dh_thoigiandathang: order.createdAt || timestamp(-index * 120),
  dh_thanhtien: order.totalAmount || order.total || 0,
  dh_ngayxuly: order.status === 'Chờ xác nhận' ? null : order.createdAt || timestamp(-index * 120),
  tt_ma: order.tt_ma || paymentMethodIdByName[order.paymentMethod] || 1,
  vc_ma_giamgia: order.vc_ma || null,
  dh_taomoi: order.createdAt || timestamp(-index * 120),
  status: order.status,
  update: order.update,
  eta: order.eta,
}));

const chitietDonHangRows = orders.flatMap((order) => (order.items || []).map((item, itemIndex) => ({
  id: `${order.orderNumber || order.id}-${itemIndex + 1}`,
  dh_ma: order.orderNumber || order.id,
  sp_ma: item.productId,
  ctdh_soluong: item.quantity,
  ctdh_dongia: item.price,
  created_at: order.createdAt || timestamp(),
})));

const managedCollections = {
  quyen: [
    { q_ma: 1, q_ten: 'Quản trị viên', q_diengia: 'Toàn quyền quản lý hệ thống', q_taomoi: timestamp() },
    { q_ma: 2, q_ten: 'Nhân viên bán hàng', q_diengia: 'Tiếp nhận và xử lý đơn hàng', q_taomoi: timestamp() },
  ],
  user_activations: [
    { id: 1, user_ma: 2, token: 'ACT-BOARDGAME-0001', is_used: 1, expires_at: timestamp(1440), created_at: timestamp() },
  ],
  password_resets: [
    { id: 1, user_ma: 2, token: 'RESET-BOARDGAME-0001', is_used: 0, expires_at: timestamp(60), created_at: timestamp() },
  ],
  diachigiaohang: customerAddressRows,
  nhacungcap: [
    { ncc_ma: 1, ncc_ten: 'Everjoy Publishing', ncc_email: 'contact@everjoypublishing.vn', ncc_diachi: 'TP. Hồ Chí Minh, Việt Nam', ncc_dienthoai: '+84-28-0000-0000', ncc_taomoi: timestamp() },
    { ncc_ma: 2, ncc_ten: 'Hobby Japan', ncc_email: 'sales@hobbyjapan.jp', ncc_diachi: 'Tokyo, Nhật Bản', ncc_dienthoai: '+81-3-0000-0000', ncc_taomoi: timestamp() },
    { ncc_ma: 3, ncc_ten: 'Pearl Games', ncc_email: 'hello@pearlgames.eu', ncc_diachi: 'Brussels, Bỉ', ncc_dienthoai: '+32-2-000-0000', ncc_taomoi: timestamp() },
    { ncc_ma: 4, ncc_ten: 'Gamewright', ncc_email: 'orders@gamewright.com', ncc_diachi: 'Boston, Hoa Kỳ', ncc_dienthoai: '+1-617-000-0000', ncc_taomoi: timestamp() },
    { ncc_ma: 5, ncc_ten: 'Plaid Hat Games', ncc_email: 'sales@plaidhatgames.com', ncc_diachi: 'Dallas, Hoa Kỳ', ncc_dienthoai: '+1-214-000-0000', ncc_taomoi: timestamp() },
    { ncc_ma: 6, ncc_ten: 'Czech Games Edition', ncc_email: 'support@czechgames.com', ncc_diachi: 'Prague, Cộng hòa Séc', ncc_dienthoai: '+420-222-000-000', ncc_taomoi: timestamp() },
  ],
  phieunhap: [
    { pn_ma: 1, ncc_ma: 1, nv_ma: 1, pn_ngayxacnhan: timestamp(), pn_taomoi: timestamp() },
  ],
  chitietnhap: [
    { id: 1, pn_ma: 1, sp_ma: 1, ctn_soluong: 10, ctn_dongia: 520000, created_at: timestamp() },
    { id: 2, pn_ma: 1, sp_ma: 9, ctn_soluong: 8, ctn_dongia: 410000, created_at: timestamp() },
  ],
  loai: [
    { loai_ma: 1, loai_ten: 'Chiến lược', loai_taomoi: timestamp() },
    { loai_ma: 2, loai_ten: 'Gia đình', loai_taomoi: timestamp() },
    { loai_ma: 3, loai_ten: 'Party', loai_taomoi: timestamp() },
    { loai_ma: 4, loai_ten: 'Suy luận', loai_taomoi: timestamp() },
  ],
  chude: [
    { cd_ma: 1, cd_ten: 'Gia đình', cd_taomoi: timestamp() },
    { cd_ma: 2, cd_ten: 'Chiến thuật', cd_taomoi: timestamp() },
    { cd_ma: 3, cd_ten: 'Party', cd_taomoi: timestamp() },
    { cd_ma: 4, cd_ten: 'Nhập môn', cd_taomoi: timestamp() },
  ],
  nhaxuatban: [
    { nxb_ma: 1, nxb_ten: 'Asmodee', nxb_quocgia: 'Pháp', nxb_website: 'https://asmodee.com', nxb_taomoi: timestamp() },
    { nxb_ma: 2, nxb_ten: 'Hobby Japan', nxb_quocgia: 'Nhật Bản', nxb_website: 'https://hobbyjapan.co.jp', nxb_taomoi: timestamp() },
    { nxb_ma: 3, nxb_ten: 'Rio Grande Games', nxb_quocgia: 'Mỹ', nxb_website: 'https://riograndegames.com', nxb_taomoi: timestamp() },
  ],
  sanpham: products.map((product, index) => ({
    sp_ma: product.id,
    sp_ten: product.name,
    loai_ma: [1, 2, 3, 4][index % 4],
    nxb_ma: [1, 2, 3][index % 3],
    sp_giaban: product.price,
    sp_soluong: product.stock || 0,
    sp_sokhach_min: Number.parseInt(String(product.players).split('-')[0], 10) || 1,
    sp_thoigianchoi: 45 + (index * 5),
    sp_chitiet: product.description,
    sp_taomoi: timestamp(),
  })),
  hinhanhsanpham: products.map((product, index) => ({
    ha_ma: index + 1,
    sp_ma: product.id,
    ha_url: product.image,
    ha_macdinh: index === 0 ? 1 : 0,
    created_at: timestamp(),
  })),
  chitietchude: products.slice(0, 8).map((product, index) => ({
    id: index + 1,
    sp_ma: product.id,
    cd_ma: [1, 2, 3, 4][index % 4],
    created_at: timestamp(),
  })),
  yeuthich: [
    { id: 1, sp_ma: 1, user_ma: 2, created_at: timestamp() },
    { id: 2, sp_ma: 9, user_ma: 2, created_at: timestamp() },
  ],
  binhluan: [
    { bl_ma: 1, sp_ma: 1, user_ma: 2, nv_ma: 1, bl_noidung: 'Dễ chơi, rất hợp nhóm bạn.', bl_cha: null, created_at: timestamp() },
    { bl_ma: 2, sp_ma: 9, user_ma: 2, nv_ma: null, bl_noidung: 'Bản đồ đẹp, tương tác tốt.', bl_cha: 1, created_at: timestamp() },
  ],
  danhgia: [
    { dg_ma: 1, sp_ma: 1, user_ma: 2, dh_ma: 'DH-2486', dg_sosao: 5, dg_noidung: 'Rất đáng mua.', dg_taomoi: timestamp() },
    { dg_ma: 2, sp_ma: 9, user_ma: 2, dh_ma: 'DH-2482', dg_sosao: 5, dg_noidung: 'Chơi nhiều lần vẫn vui.', dg_taomoi: timestamp() },
  ],
  voucher: [
    { vc_ma: 1, vc_code: 'SALE50K', vc_ten: 'Giảm 50K', vc_loaigiamgia: 2, vc_giatri: 50000, vc_giamtoida: null, vc_dieukien_toithieu: 500000, vc_soluong: 100, vc_dasudung: 12, vc_ngaybatdau: timestamp(-60), vc_ngayketthuc: timestamp(43200), vc_taomoi: timestamp() },
    { vc_ma: 2, vc_code: 'SUMMER15', vc_ten: 'Giảm 15%', vc_loaigiamgia: 1, vc_giatri: 15, vc_giamtoida: 150000, vc_dieukien_toithieu: 800000, vc_soluong: 50, vc_dasudung: 4, vc_ngaybatdau: timestamp(-120), vc_ngayketthuc: timestamp(86400), vc_taomoi: timestamp() },
  ],
  voucher_khachhang: [
    { id: 1, vc_ma: 1, user_ma: 2, da_su_dung: 1, ngay_su_dung: timestamp() },
  ],
  thanhtoan: [
    { tt_ma: 1, tt_ten: 'COD', tt_diengia: 'Thanh toán khi nhận hàng', tt_taomoi: timestamp() },
    { tt_ma: 2, tt_ten: 'MOMO', tt_diengia: 'Thanh toán qua ví MOMO', tt_taomoi: timestamp() },
    { tt_ma: 3, tt_ten: 'VNPay', tt_diengia: 'Thanh toán qua VNPay', tt_taomoi: timestamp() },
  ],
  donvivanchuyen: [
    { dv_ma: 1, dv_ten: 'Giao hàng nhanh', dv_diengia: 'Giao trong ngày tại khu vực nội thành', dv_taomoi: timestamp() },
    { dv_ma: 2, dv_ten: 'Giao hàng tiết kiệm', dv_diengia: 'Phù hợp đơn hàng toàn quốc', dv_taomoi: timestamp() },
  ],
  donhang: donhangRows,
  chitietdonhang: chitietDonHangRows,
  donthue: [
    { dt_ma: 1, user_ma: 2, diachigiaohang_ma: 1, nv_uly: 2, tt_ma: 1, vc_ma: null, dt_ngaydat: timestamp(), dt_ngaybatdauthue: '2026-07-10', dt_ngayphailai: '2026-07-17', dt_ngaytralai_thucte: null, dt_tongtienthue: 450000, dt_tongtiencoc: 300000, dt_tiencoc_hoanlai: null, dt_taomoi: timestamp() },
  ],
  chitietdonthue: [
    { id: 1, dt_ma: 1, sp_ma: 6, ctdt_soluong: 1, ctdt_giathuengay: 65000, ctdt_tinhtrangtra: 1, ctdt_ghichu: 'Tốt', created_at: timestamp() },
  ],
  blog_chuyenmuc: [
    { bcm_ma: 1, bcm_ten: 'Review', bcm_slug: 'review' },
    { bcm_ma: 2, bcm_ten: 'Hướng dẫn', bcm_slug: 'huong-dan' },
    { bcm_ma: 3, bcm_ten: 'Tin tức', bcm_slug: 'tin-tuc' },
    { bcm_ma: 4, bcm_ten: 'Party', bcm_slug: 'party' },
  ],
  blog: blogPosts.map((post, index) => ({
    bl_ma: post.id,
    bcm_ma: [1, 2, 3, 4][index % 4],
    nv_ma: 1,
    sp_ma: products[index % products.length].id,
    bl_ten: post.title,
    bl_slug: `blog-${post.id}`,
    bl_noidung: post.excerpt,
    bl_taomoi: timestamp(),
  })),
  blog_binhluan: [
    { bbl_ma: 1, bl_ma: 1, user_ma: 2, bbl_noidung: 'Bài viết hữu ích.', bbl_taomoi: timestamp() },
    { bbl_ma: 2, bl_ma: 2, user_ma: 2, bbl_noidung: 'Mình muốn xem thêm bài tương tự.', bbl_taomoi: timestamp() },
  ],
  chatbot_phienhoithoai: [
    { ph_ma: 1, user_ma: 2, nv_ma: 2, ph_batdau: timestamp(), ph_da_chuyenchonv: 1 },
    { ph_ma: 2, user_ma: 2, nv_ma: null, ph_batdau: timestamp(-20), ph_da_chuyenchonv: 0 },
  ],
  chatbot_tinnhan: [
    { tn_ma: 1, ph_ma: 1, tn_nguoigui: 1, tn_noidung: 'Mình cần gợi ý game cho 4 người.', sp_ma: 1, created_at: timestamp() },
    { tn_ma: 2, ph_ma: 1, tn_nguoigui: 0, tn_noidung: 'Bạn có thể thử Catan hoặc Ticket to Ride.', sp_ma: 2, created_at: timestamp() },
    { tn_ma: 3, ph_ma: 2, tn_nguoigui: 1, tn_noidung: 'Game nào dễ chơi cho gia đình?', sp_ma: 8, created_at: timestamp() },
  ],
};

const managedCollectionNames = Object.keys(managedCollections);

module.exports = {
  managedCollections,
  managedCollectionNames,
};