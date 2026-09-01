function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCompletedStatusLabel(status) {
  const normalized = normalizeText(status);
  return normalized.includes('hoan thanh')
    || normalized.includes('hoan tat')
    || normalized.includes('da giao')
    || normalized.includes('giao thanh cong')
    || normalized.includes('completed')
    || normalized.includes('done')
    || normalized.includes('da nhan');
}

function normalizeProductId(item) {
  const candidates = [item?.productId, item?.sp_ma, item?.id, item?.product_id, item?.spid, item?.product?.id, item?.product?.sp_ma];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function normalizeQuantity(item) {
  const candidates = [item?.quantity, item?.ctdh_soluong, item?.soluong, item?.qty, item?.count, item?.product?.quantity, item?.productQuantity];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function getCompletedOrderStockDelta(order) {
  const delta = new Map();
  const items = Array.isArray(order?.items) ? order.items : [];

  items.forEach((item) => {
    const productId = normalizeProductId(item);
    const quantity = normalizeQuantity(item);
    if (!productId || !quantity) {
      return;
    }

    delta.set(productId, (delta.get(productId) || 0) - quantity);
  });

  return delta;
}

function getOrderStatusStockDelta(order, prevStatus, nextStatus) {
  const prevCompleted = isCompletedStatusLabel(prevStatus);
  const nextCompleted = isCompletedStatusLabel(nextStatus);

  if (prevCompleted === nextCompleted) {
    return new Map();
  }

  const delta = getCompletedOrderStockDelta(order);
  if (!delta.size) {
    return new Map();
  }

  if (nextCompleted) {
    return delta;
  }

  return new Map([...delta].map(([productId, quantity]) => [productId, -quantity]));
}

module.exports = {
  normalizeText,
  isCompletedStatusLabel,
  normalizeProductId,
  normalizeQuantity,
  getCompletedOrderStockDelta,
  getOrderStatusStockDelta,
};
