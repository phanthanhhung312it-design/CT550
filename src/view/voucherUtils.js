export function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function normalizeVoucherItem(voucher = {}) {
  const scope = String(voucher.scope || voucher.vc_scope || 'public').toLowerCase();
  const discountType = Number(voucher.discountType || voucher.type || voucher.vc_loaigiamgia || 2);
  const value = Number(voucher.value || voucher.vc_giatri || 0);
  const maxDiscount = Number(voucher.maxDiscount || voucher.vc_giamtoida || 0);
  const minAmount = Number(voucher.minAmount || voucher.vc_dieukien_toithieu || 0);

  return {
    id: voucher.id || voucher.vc_ma || voucher.code || voucher.vc_code,
    code: String(voucher.code || voucher.vc_code || '').trim().toUpperCase(),
    title: String(voucher.title || voucher.vc_ten || voucher.code || voucher.vc_code || 'Voucher').trim(),
    scope: scope.includes('private') ? 'private' : 'public',
    discountType,
    value,
    maxDiscount,
    minAmount,
    endDate: voucher.endDate || voucher.vc_ngayketthuc || null,
    status: String(voucher.status || voucher.vc_trangthai || 'active').trim(),
  };
}

export function applyVoucher(subtotal, voucher) {
  if (!voucher || subtotal <= 0) {
    return 0;
  }

  const minAmount = Number(voucher.minAmount || 0);
  if (subtotal < minAmount) {
    return 0;
  }

  const value = Number(voucher.value || 0);
  const maxDiscount = Number(voucher.maxDiscount || 0);

  if (Number(voucher.discountType || 2) === 1) {
    const discount = Math.round((subtotal * value) / 100);
    return maxDiscount > 0 ? Math.min(discount, maxDiscount) : discount;
  }

  return Math.min(value, subtotal);
}

export function resolveVoucherErrorMessage(message = '') {
  const normalized = normalizeText(message);

  if (!message) {
    return 'Không có mã voucher này';
  }

  if (normalized.includes('khong co ma voucher') || normalized.includes('ma voucher khong ton tai') || normalized.includes('voucher khong ton tai')) {
    return 'Không có mã voucher này';
  }

  if (normalized.includes('da het han')) {
    return 'Voucher đã hết hạn.';
  }

  if (normalized.includes('da het luot') || normalized.includes('da su dung') || normalized.includes('ban da dung het')) {
    return 'Voucher đã được sử dụng hoặc hết lượt áp dụng.';
  }

  if (normalized.includes('khong du dieu kien') || normalized.includes('toi thieu') || normalized.includes('chua dat')) {
    return 'Voucher không đủ điều kiện áp dụng cho đơn hàng hiện tại.';
  }

  if (normalized.includes('chua den thoi gian') || normalized.includes('chua toi thoi gian')) {
    return 'Voucher chưa đến thời gian sử dụng.';
  }

  if (normalized.includes('duoc chi dinh') || normalized.includes('khong thuoc danh sach') || normalized.includes('khong phai')) {
    return 'Voucher này không dành cho tài khoản hiện tại.';
  }

  return message;
}

export function getVoucherConditionMessage(subtotal, voucher) {
  if (!voucher) {
    return 'Không có mã voucher này';
  }

  const minAmount = Number(voucher.minAmount || 0);
  if (minAmount > 0 && subtotal < minAmount) {
    return `Đơn hàng chưa đạt tối thiểu ${Number(minAmount).toLocaleString('vi-VN')} đ để áp dụng voucher.`;
  }

  if (String(voucher.status || '').toLowerCase() === 'expired') {
    return 'Voucher đã hết hạn.';
  }

  return '';
}
