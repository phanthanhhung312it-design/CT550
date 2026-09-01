const mongoose = require('mongoose');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function summarizePurchaseTotal(items = []) {
  return items.reduce((total, item) => {
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const unitPrice = Math.max(0, toNumber(item?.unitPrice, 0));
    return total + (quantity * unitPrice);
  }, 0);
}

function validatePurchaseItems(items = []) {
  const normalizedItems = Array.isArray(items) ? items.filter((item) => item && (item.productId || item.sp_ma || item.id)) : [];

  if (normalizedItems.length === 0) {
    return { isValid: false, message: 'Phải có ít nhất một sản phẩm trong phiếu nhập.' };
  }

  const seenProductIds = new Set();

  for (const item of normalizedItems) {
    const productId = toNumber(item.productId ?? item.sp_ma ?? item.id, 0);
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unitPrice ?? item.ctn_dongia ?? item.price, 0);

    if (productId <= 0) {
      return { isValid: false, message: 'Sản phẩm nhập không hợp lệ.' };
    }

    if (seenProductIds.has(productId)) {
      return { isValid: false, message: 'Không được thêm cùng một sản phẩm nhiều lần trong cùng phiếu.' };
    }
    seenProductIds.add(productId);

    if (quantity <= 0) {
      return { isValid: false, message: 'Số lượng nhập phải lớn hơn 0.' };
    }

    if (unitPrice < 0) {
      return { isValid: false, message: 'Giá nhập không được âm.' };
    }
  }

  return { isValid: true, items: normalizedItems };
}

async function getCollection(name) {
  return mongoose.connection.collection(name);
}

async function getNextPurchaseReceiptId() {
  const collection = await getCollection('phieunhap');
  const latestReceipt = await collection.findOne({}, { sort: { pn_ma: -1 } });
  return (Number(latestReceipt?.pn_ma || 0) + 1) || 1;
}

async function getNextDetailId() {
  const collection = await getCollection('chitietnhap');
  const latestRow = await collection.findOne({}, { sort: { id: -1 } });
  return (Number(latestRow?.id || 0) + 1) || 1;
}

async function getSupplierById(supplierId) {
  const collection = await getCollection('nhacungcap');
  const idValue = Number(supplierId);
  return collection.findOne({
    $or: [
      { ncc_ma: idValue },
      { id: idValue },
      { _id: idValue },
    ],
  });
}

async function getProductById(productId) {
  const collection = await getCollection('sanpham');
  const idValue = Number(productId);
  return collection.findOne({
    $or: [
      { sp_ma: idValue },
      { id: idValue },
      { _id: idValue },
    ],
  });
}

async function createPurchaseReceipt(payload = {}) {
  const supplierId = Number(payload.supplierId ?? payload.ncc_ma ?? payload.nccId);
  const employeeId = Number(payload.employeeId ?? payload.nv_ma ?? payload.employeeId ?? 1);
  const note = String(payload.note || '').trim();
  const dateValue = payload.date || payload.pn_ngaynhap || new Date();
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!supplierId || supplierId <= 0) {
    throw new Error('Phải chọn nhà cung cấp trước khi lưu phiếu nhập.');
  }

  const validation = validatePurchaseItems(items);
  if (!validation.isValid) {
    throw new Error(validation.message);
  }

  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new Error('Nhà cung cấp không tồn tại trong hệ thống.');
  }

  const normalizedItems = validation.items.map((item) => ({
    productId: Number(item.productId ?? item.sp_ma ?? item.id),
    quantity: toNumber(item.quantity, 0),
    unitPrice: toNumber(item.unitPrice ?? item.ctn_dongia ?? item.price, 0),
  }));

  const productChecks = await Promise.all(normalizedItems.map(async (item) => {
    const product = await getProductById(item.productId);
    if (!product) {
      throw new Error('Sản phẩm nhập phải tồn tại trong sanpham.');
    }
    if (item.quantity <= 0) {
      throw new Error('Số lượng nhập phải lớn hơn 0.');
    }
    if (item.unitPrice < 0) {
      throw new Error('Giá nhập không được âm.');
    }
    return { ...item, product };
  }));

  const totalAmount = summarizePurchaseTotal(productChecks.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  })));

  const receiptId = await getNextPurchaseReceiptId();
  const receiptDate = new Date(dateValue);
  const receiptDocument = {
    pn_ma: receiptId,
    ncc_ma: supplierId,
    nv_ma: employeeId,
    pn_ngaynhap: receiptDate,
    pn_ngayxacnhan: receiptDate,
    pn_taomoi: new Date(),
    pn_tongtien: totalAmount,
    pn_trangthai: 'Hoàn tất',
    pn_ghichu: note || '',
  };

  const phieuNhapCollection = await getCollection('phieunhap');
  const detailCollection = await getCollection('chitietnhap');
  const productCollection = await getCollection('sanpham');

  await phieuNhapCollection.insertOne(receiptDocument);

  let nextDetailId = await getNextDetailId();
  const detailRows = [];

  for (const item of productChecks) {
    const detailDocument = {
      id: nextDetailId,
      pn_ma: receiptId,
      sp_ma: item.productId,
      ctn_soluong: item.quantity,
      ctn_dongia: item.unitPrice,
      created_at: new Date(),
    };

    nextDetailId += 1;
    await detailCollection.insertOne(detailDocument);

    const currentProduct = await productCollection.findOne({
      $or: [{ sp_ma: item.productId }, { id: item.productId }, { _id: item.productId }],
    });

    if (!currentProduct) {
      throw new Error(`Sản phẩm ${item.productId} không còn tồn tại trong sanpham.`);
    }

    const currentStock = toNumber(currentProduct.sp_soluong ?? currentProduct.stock, 0);
    await productCollection.updateOne(
      { _id: currentProduct._id },
      { $set: { sp_soluong: currentStock + item.quantity } },
    );

    await mongoose.connection.collection('products')
      .updateOne(
        { id: item.productId },
        { $inc: { stock: item.quantity } },
        { upsert: true },
      )
      .catch(() => {});

    detailRows.push(detailDocument);
  }

  return {
    id: receiptId,
    receipt: receiptDocument,
    items: detailRows,
    totalAmount,
    supplier,
  };
}

module.exports = {
  createPurchaseReceipt,
  summarizePurchaseTotal,
  validatePurchaseItems,
};
