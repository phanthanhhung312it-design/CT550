function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function normalizeOrderStatus(status) {
  const normalized = normalizeText(status);

  if (!normalized) {
    return 'Đang xử lý';
  }

  if (normalized.includes('huy')) {
    return 'Đã hủy';
  }

  if (
    normalized.includes('hoan tat') ||
    normalized.includes('hoan thanh') ||
    normalized.includes('da giao') ||
    normalized.includes('giao thanh cong') ||
    normalized.includes('completed') ||
    normalized.includes('done') ||
    normalized.includes('da nhan')
  ) {
    return 'Hoàn thành';
  }

  if (normalized.includes('dang giao') || normalized.includes('giao hang') || normalized.includes('giao')) {
    return 'Đang giao';
  }

  if (
    normalized.includes('cho xac nhan') ||
    normalized.includes('chờ xac nhan') ||
    normalized.includes('da dat') ||
    normalized.includes('dat hang') ||
    normalized.includes('chờ xác nhận')
  ) {
    return 'Chờ xác nhận';
  }

  return 'Đang xử lý';
}

function isCompletedOrderStatus(status) {
  return normalizeOrderStatus(status) === 'Hoàn thành';
}

module.exports = {
  normalizeText,
  normalizeOrderStatus,
  isCompletedOrderStatus,
};
