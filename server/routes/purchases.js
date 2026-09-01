const express = require('express');
const mongoose = require('mongoose');
const { createPurchaseReceipt, summarizePurchaseTotal, validatePurchaseItems } = require('../services/purchaseService');

const router = express.Router();

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatProductName(product) {
  return product?.sp_ten || product?.name || `Sản phẩm #${product?.sp_ma || product?.id || '-'}`;
}

async function listPurchaseReceipts() {
  const [receipts, details, suppliers, employees, products] = await Promise.all([
    getCollection('phieunhap').find({}).sort({ pn_ma: -1 }).toArray().catch(() => []),
    getCollection('chitietnhap').find({}).toArray().catch(() => []),
    getCollection('nhacungcap').find({}).toArray().catch(() => []),
    getCollection('employees').find({}).toArray().catch(() => []),
    getCollection('sanpham').find({}).toArray().catch(() => []),
  ]);

  const supplierMap = new Map(suppliers.map((item) => [toNumber(item.ncc_ma || item.id, 0), item]));
  const employeeMap = new Map(employees.map((item) => [toNumber(item.nv_ma || item.id, 0), item]));
  const productMap = new Map(products.map((item) => [toNumber(item.sp_ma || item.id, 0), item]));

  const detailMap = new Map();
  details.forEach((detail) => {
    const key = toNumber(detail.pn_ma, 0);
    const rows = detailMap.get(key) || [];
    rows.push(detail);
    detailMap.set(key, rows);
  });

  return receipts.map((receipt) => {
    const receiptId = toNumber(receipt.pn_ma, 0);
    const supplier = supplierMap.get(toNumber(receipt.ncc_ma, 0)) || null;
    const employee = employeeMap.get(toNumber(receipt.nv_ma, 0)) || null;
    const items = (detailMap.get(receiptId) || []).map((detail) => {
      const product = productMap.get(toNumber(detail.sp_ma, 0));
      const itemSupplierId = toNumber(product?.ncc_ma ?? detail?.ncc_ma ?? receipt?.ncc_ma, 0);
      const itemSupplier = supplierMap.get(itemSupplierId) || null;
      const quantity = toNumber(detail.ctn_soluong, 0);
      const unitPrice = toNumber(detail.ctn_dongia, 0);

      return {
        productId: toNumber(detail.sp_ma, 0),
        name: formatProductName(product),
        quantity,
        unitPrice,
        supplierId: itemSupplierId,
        supplierName: itemSupplier?.ncc_ten || itemSupplier?.name || supplier?.ncc_ten || supplier?.name || 'Chưa xác định',
        total: quantity * unitPrice,
      };
    });

    const total = receipt.pn_tongtien ?? summarizePurchaseTotal(items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));

    return {
      id: receiptId,
      code: `PN${String(receiptId).padStart(3, '0')}`,
      supplierId: toNumber(receipt.ncc_ma, 0),
      supplierName: supplier?.ncc_ten || supplier?.name || 'Chưa xác định',
      employeeId: toNumber(receipt.nv_ma, 0),
      employeeName: employee?.fullName || employee?.nv_ten || employee?.displayName || 'Nhân viên',
      receivedAt: receipt.pn_ngaynhap || receipt.pn_ngayxacnhan || receipt.pn_taomoi,
      createdAt: receipt.pn_taomoi || receipt.pn_ngaynhap || receipt.pn_ngayxacnhan,
      total,
      note: receipt.pn_ghichu || '',
      status: receipt.pn_trangthai || 'Hoàn tất',
      items,
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const receipts = await listPurchaseReceipts();
    res.json(receipts);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const receiptId = toNumber(req.params.id, 0);
    const receipts = await listPurchaseReceipts();
    const receipt = receipts.find((item) => item.id === receiptId || item.code === String(req.params.id));

    if (!receipt) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu nhập.' });
    }

    res.json(receipt);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const receipt = await createPurchaseReceipt(req.body || {});
    res.status(201).json(receipt);
  } catch (error) {
    const statusCode = error.message?.includes('không tồn tại') || error.message?.includes('phải chọn') || error.message?.includes('ít nhất') || error.message?.includes('phải lớn hơn 0') || error.message?.includes('không được âm') ? 400 : 500;
    res.status(statusCode).json({ message: error.message || 'Không thể tạo phiếu nhập.' });
  }
});

router.get('/suppliers', async (req, res, next) => {
  try {
    const suppliers = await getCollection('nhacungcap').find({}).toArray().catch(() => []);
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const products = await getCollection('sanpham').find({}).toArray().catch(() => []);
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.post('/validate', async (req, res, next) => {
  try {
    const validation = validatePurchaseItems(req.body?.items || []);
    res.json(validation);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
