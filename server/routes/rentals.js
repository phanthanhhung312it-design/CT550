const express = require('express');
const mongoose = require('mongoose');
const { isDbConnected } = require('../config/db');
const { listVisibleVouchersForUser, validateVoucherCode, consumeVoucherUsage } = require('../services/voucherService');

const router = express.Router();

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function repairVietnamese(value) {
  const text = String(value || '');
  const dictionary = {
    'Dang x? l�': 'Đang xử lý',
    'D� thanh to�n': 'Đã thanh toán',
    'D� x�c nh?n': 'Đã xác nhận',
    'C?p nh?t t? admin test': 'Cập nhật từ admin',
  };

  let repaired = dictionary[text] || text;

  const replacements = [
    [/c\?a/gi, 'của'],
    [/m\?nh/gi, 'mình'],
    [/kh\?ng/gi, 'không'],
    [/d\?ng/gi, 'dùng'],
    [/du\?c/gi, 'được'],
    [/x\?c nh\?n/gi, 'xác nhận'],
    [/thanh to\?n/gi, 'thanh toán'],
    [/x\? l\?/gi, 'xử lý'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    repaired = repaired.replace(pattern, replacement);
  });

  return repaired;
}

function formatRentalCode(value) {
  const numeric = toNumber(value, 0);
  return `DT-${String(numeric).padStart(5, '0')}`;
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 1;
  }

  const diffTime = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function mapProductToRental(product) {
  const id = toNumber(product.id || product.sp_ma, 0);
  const name = product.name || product.sp_ten || `BoardGame #${id}`;
  const category = product.category || product.loai_ten || 'Khác';
  const players = product.players || product.sp_songuoichoi || `${product.sp_sokhach_min || 2}-${product.sp_sokhach_max || 6}`;
  const image = product.image || product.sp_hinhanh || '/image/catan.jpg';
  const stock = Math.max(0, toNumber(product.stock ?? product.sp_soluong, 0));
  const basePrice = toNumber(product.price ?? product.sp_giaban, 0);
  const rentalPricePerDay = Math.max(10000, Math.round(basePrice * 0.1));
  const deposit = Math.min(100000, Math.max(50000, Math.round(basePrice * 0.35)));
  const maxRentalDays = 14;

  return {
    productId: id,
    name,
    category,
    players,
    image,
    stock,
    rentalPricePerDay,
    deposit,
    maxRentalDays,
  };
}

async function getRentalProducts() {
  if (!isDbConnected()) {
    return [];
  }

  const [productRows, sanphamRows] = await Promise.all([
    getCollection('products').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('sanpham').find({}).project({ _id: 0 }).toArray().catch(() => []),
  ]);

  const mappedProducts = [
    ...productRows.map(mapProductToRental),
    ...sanphamRows.map(mapProductToRental),
  ].filter((item) => item.productId > 0 && item.stock > 0);

  const uniqueMap = new Map();

  mappedProducts.forEach((item) => {
    if (!uniqueMap.has(item.productId)) {
      uniqueMap.set(item.productId, item);
      return;
    }

    const existingItem = uniqueMap.get(item.productId);
    if (item.stock > existingItem.stock) {
      uniqueMap.set(item.productId, item);
    }
  });

  return [...uniqueMap.values()].sort((left, right) => left.productId - right.productId);
}

function getShippingFee(shippingUnit) {
  const normalizedName = normalizeText(shippingUnit?.dv_ten || shippingUnit?.name || '');

  if (normalizedName.includes('nhanh')) {
    return 35000;
  }

  if (normalizedName.includes('tiet kiem')) {
    return 18000;
  }

  return 25000;
}

async function getRentalOptions(userId) {
  if (!isDbConnected()) {
    return {
      addresses: [],
      paymentMethods: [],
      shippingUnits: [],
      vouchers: [],
    };
  }

  const normalizedUserId = toNumber(userId, 0);

  const [addresses, paymentMethods, shippingUnits, visibleVouchers] = await Promise.all([
    normalizedUserId > 0
      ? getCollection('diachigiaohang').find({}).project({ _id: 0 }).toArray().catch(() => [])
      : Promise.resolve([]),
    getCollection('thanhtoan').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('donvivanchuyen').find({}).project({ _id: 0 }).toArray().catch(() => []),
    listVisibleVouchersForUser(userId),
  ]);

  const filteredAddresses = normalizedUserId > 0
    ? addresses.filter((item) => toNumber(item.user_ma || item.userId, 0) === normalizedUserId)
    : addresses;

  return {
    addresses: filteredAddresses.map((item, index) => ({
      id: item.dc_ma || item.id || index + 1,
      userId: item.user_ma || item.userId || null,
      recipientName: item.dc_hoten || item.fullName || 'Khách hàng',
      addressLine: item.dc_diachi || [item.dc_sonha, item.dc_tinh, item.dc_quanhuyen].filter(Boolean).join(', ') || item.address || 'Chưa cập nhật',
      isDefault: Boolean(item.dc_macdinh),
      phone: item.dc_dienthoai || item.phone || '',
    })),
    paymentMethods: paymentMethods.map((item, index) => ({
      id: item.tt_ma || item.id || index + 1,
      name: item.tt_ten || item.name || 'COD',
      description: item.tt_diengia || item.description || '',
    })),
    shippingUnits: shippingUnits.map((item, index) => ({
      id: item.dv_ma || item.id || index + 1,
      name: item.dv_ten || item.name || 'Đơn vị vận chuyển',
      description: item.dv_diengia || item.description || '',
      fee: getShippingFee(item),
    })),
    vouchers: [...(visibleVouchers.publicVouchers || []), ...(visibleVouchers.privateVouchers || [])].map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      scope: item.scope,
      type: item.discountType,
      value: item.value,
      maxDiscount: item.maxDiscount,
      minAmount: item.minAmount,
      startDate: item.startDate,
      endDate: item.endDate,
      remainingQuantity: item.remainingQuantity,
      maxUsesPerCustomer: item.maxUsesPerCustomer,
      assignment: item.assignment,
    })),
  };
}

function applyVoucher(subtotal, voucher) {
  if (!voucher || subtotal <= 0) {
    return { discountAmount: 0, voucherCode: '' };
  }

  const voucherCode = voucher.vc_code || voucher.code || '';
  const voucherType = toNumber(voucher.vc_loaigiamgia || voucher.type, 2);
  const voucherValue = toNumber(voucher.vc_giatri || voucher.value, 0);
  const maxDiscount = toNumber(voucher.vc_giamtoida || voucher.maxDiscount, 0);
  const minAmount = toNumber(voucher.vc_dieukien_toithieu || voucher.minAmount, 0);

  if (subtotal < minAmount) {
    return { discountAmount: 0, voucherCode };
  }

  let discountAmount = 0;

  if (voucherType === 1) {
    discountAmount = Math.round((subtotal * voucherValue) / 100);
    if (maxDiscount > 0) {
      discountAmount = Math.min(discountAmount, maxDiscount);
    }
  } else {
    discountAmount = voucherValue;
  }

  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

  return { discountAmount, voucherCode };
}

async function mapRentalDocuments(donthueRows) {
  if (!isDbConnected() || donthueRows.length === 0) {
    return [];
  }

  const [detailRows, users, products, paymentMethods, shippingUnits, addresses, vouchers] = await Promise.all([
    getCollection('chitietdonthue').find({}).toArray().catch(() => []),
    getCollection('users').find({}).project({ _id: 0, id: 1, username: 1, displayName: 1, fullName: 1, phone: 1, email: 1 }).toArray().catch(() => []),
    getRentalProducts(),
    getCollection('thanhtoan').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('donvivanchuyen').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('diachigiaohang').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('voucher').find({}).project({ _id: 0 }).toArray().catch(() => []),
  ]);

  const detailsByRentalId = detailRows.reduce((map, detail) => {
    const rentalId = toNumber(detail.dt_ma, -1);
    if (!map.has(rentalId)) {
      map.set(rentalId, []);
    }

    map.get(rentalId).push(detail);
    return map;
  }, new Map());

  const userMap = new Map(users.map((user) => [toNumber(user.id, -1), user]));
  const productMap = new Map(products.map((product) => [toNumber(product.productId, -1), product]));
  const paymentMap = new Map(paymentMethods.map((payment) => [toNumber(payment.tt_ma || payment.id, -1), payment]));
  const shippingMap = new Map(shippingUnits.map((shipping) => [toNumber(shipping.dv_ma || shipping.id, -1), shipping]));
  const addressMap = new Map(addresses.map((address) => [toNumber(address.dc_ma || address.id, -1), address]));
  const voucherMap = new Map(vouchers.map((voucher) => [toNumber(voucher.vc_ma || voucher.id, -1), voucher]));

  return donthueRows.map((rental) => {
    const rentalId = toNumber(rental.dt_ma, 0);
    const details = detailsByRentalId.get(rentalId) || [];
    const user = userMap.get(toNumber(rental.user_ma, -1));
    const address = addressMap.get(toNumber(rental.diachigiaohang_ma, -1));
    const payment = paymentMap.get(toNumber(rental.tt_ma, -1));
    const shipping = shippingMap.get(toNumber(rental.dv_ma, -1));
    const voucher = voucherMap.get(toNumber(rental.vc_ma, -1));

    const receiveDate = rental.dt_ngaybatdauthue || rental.receiveDate || null;
    const returnDate = rental.dt_ngayphailai || rental.returnDate || null;
    const rentalDays = daysBetween(receiveDate, returnDate);

    const items = details.map((detail, index) => {
      const product = productMap.get(toNumber(detail.sp_ma, -1));
      const quantity = Math.max(1, toNumber(detail.ctdt_soluong, 1));
      const rentalPricePerDay = toNumber(detail.ctdt_giathuengay, product?.rentalPricePerDay || 0);
      const depositPerItem = toNumber(detail.ctdt_tiencoc, product?.deposit || 0);

      return {
        id: detail.id || `${rentalId}-${index + 1}`,
        productId: toNumber(detail.sp_ma, 0),
        name: product?.name || `BoardGame #${detail.sp_ma}`,
        image: product?.image || '/image/catan.jpg',
        quantity,
        rentalDays,
        rentalPricePerDay,
        depositPerItem,
        lineRentalFee: rentalPricePerDay * rentalDays * quantity,
        lineDeposit: depositPerItem * quantity,
        returnCondition: detail.ctdt_tinhtrangtra || null,
        note: detail.ctdt_ghichu || '',
      };
    });

    const fallbackTotalRental = items.reduce((total, item) => total + item.lineRentalFee, 0);
    const fallbackTotalDeposit = items.reduce((total, item) => total + item.lineDeposit, 0);
    const totalRentalFee = toNumber(rental.dt_tongtienthue, fallbackTotalRental);
    const totalDeposit = toNumber(rental.dt_tongtiencoc, fallbackTotalDeposit);
    const shippingFee = toNumber(rental.dt_phivanchuyen, 0);
    const voucherDiscount = toNumber(rental.dt_giamgia, 0);
    const totalAmount = toNumber(rental.dt_tongthanhtoan, totalRentalFee + totalDeposit + shippingFee - voucherDiscount);
    const refundDeposit = toNumber(rental.dt_tiencoc_hoanlai, 0);

    return {
      id: rentalId,
      rentalNumber: rental.rentalNumber || formatRentalCode(rentalId),
      customerId: rental.user_ma || null,
      customerName: repairVietnamese(user?.displayName || user?.fullName || user?.username || `Khách hàng #${rental.user_ma || '-'}`),
      customerPhone: repairVietnamese(user?.phone || ''),
      customerEmail: repairVietnamese(user?.email || ''),
      receiveDate,
      returnDate,
      actualReturnDate: rental.dt_ngaytralai_thucte || null,
      createdAt: rental.dt_ngaydat || rental.dt_taomoi || null,
      rentalDays,
      address: repairVietnamese(address?.dc_diachi || [address?.dc_sonha, address?.dc_tinh, address?.dc_quanhuyen].filter(Boolean).join(', ') || rental.address || 'Chưa cập nhật'),
      addressRecipient: repairVietnamese(address?.dc_hoten || ''),
      paymentMethod: repairVietnamese(payment?.tt_ten || rental.paymentMethod || 'COD'),
      shippingUnit: repairVietnamese(shipping?.dv_ten || rental.shippingUnit || 'Chưa chọn'),
      voucherCode: repairVietnamese(voucher?.vc_code || rental.voucherCode || ''),
      totalRentalFee,
      totalDeposit,
      shippingFee,
      voucherDiscount,
      totalAmount,
      refundDeposit,
      paymentStatus: repairVietnamese(rental.dt_trangthaithanhtoan || rental.paymentStatus || 'Chưa thanh toán'),
      status: repairVietnamese(rental.dt_trangthai || rental.status || 'Chờ xác nhận'),
      note: repairVietnamese(rental.dt_ghichu || rental.note || ''),
      items: items.map((item) => ({
        ...item,
        name: repairVietnamese(item.name),
        note: repairVietnamese(item.note),
        returnCondition: repairVietnamese(item.returnCondition),
      })),
    };
  });
}

router.get('/products', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const products = await getRentalProducts();
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.get('/options', async (req, res, next) => {
  try {
    const options = await getRentalOptions(req.query.userId);
    res.json(options);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const { userId, keyword, status } = req.query;
    const donthueRows = await getCollection('donthue').find({}).sort({ dt_ma: -1 }).toArray();
    let rentals = await mapRentalDocuments(donthueRows);

    if (userId) {
      rentals = rentals.filter((rental) => String(rental.customerId) === String(userId));
    }

    if (status && status !== 'Tất cả') {
      rentals = rentals.filter((rental) => normalizeText(rental.status) === normalizeText(status));
    }

    if (keyword) {
      const query = normalizeText(keyword);
      rentals = rentals.filter((rental) => normalizeText([
        rental.rentalNumber,
        rental.customerName,
        rental.customerPhone,
      ].join(' ')).includes(query));
    }

    res.json(rentals);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const payload = req.body || {};
    const userId = toNumber(payload.userId, 0);
    const receiveDate = payload.receiveDate;
    const returnDate = payload.returnDate;
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!userId) {
      return res.status(400).json({ message: 'Thiếu userId để tạo đơn thuê.' });
    }

    if (!receiveDate || !returnDate) {
      return res.status(400).json({ message: 'Vui lòng chọn ngày nhận và ngày trả.' });
    }

    if (items.length === 0) {
      return res.status(400).json({ message: 'Đơn thuê cần ít nhất một board game.' });
    }

    const rentalProducts = await getRentalProducts();
    const productMap = new Map(rentalProducts.map((product) => [product.productId, product]));
    const rentalDays = daysBetween(receiveDate, returnDate);

    const normalizedItems = items.map((item) => {
      const productId = toNumber(item.productId, 0);
      const quantity = Math.max(1, toNumber(item.quantity, 1));
      const product = productMap.get(productId);

      if (!product) {
        throw new Error(`Không tìm thấy board game #${productId} để thuê.`);
      }

      if (quantity > product.stock) {
        throw new Error(`Số lượng thuê vượt quá tồn kho của ${product.name}.`);
      }

      const rentalPricePerDay = toNumber(item.rentalPricePerDay, product.rentalPricePerDay);
      const depositPerItem = Math.min(100000, toNumber(item.depositPerItem, product.deposit));

      return {
        productId,
        name: product.name,
        quantity,
        rentalPricePerDay,
        depositPerItem,
        lineRentalFee: rentalPricePerDay * rentalDays * quantity,
        lineDeposit: depositPerItem * quantity,
      };
    });

    const subtotalRental = normalizedItems.reduce((total, item) => total + item.lineRentalFee, 0);
    const subtotalDeposit = normalizedItems.reduce((total, item) => total + item.lineDeposit, 0);

    let discountAmount = 0;
    let voucherCode = '';
    let voucherId = null;
    if (String(payload.voucherCode || '').trim()) {
      const voucherResult = await validateVoucherCode({
        voucherCode: payload.voucherCode,
        userId,
        subtotal: subtotalRental,
      });

      if (!voucherResult.isValid) {
        return res.status(400).json({ message: voucherResult.message || 'Voucher không hợp lệ.' });
      }

      discountAmount = voucherResult.discountAmount || 0;
      voucherCode = voucherResult.voucher?.code || String(payload.voucherCode || '').trim().toUpperCase();
      voucherId = toNumber(voucherResult.voucher?.id, null);
    }

    const shippingUnit = await getCollection('donvivanchuyen').findOne({ dv_ma: toNumber(payload.shippingUnitId, 0) }).catch(() => null);
    const derivedShippingFee = shippingUnit ? getShippingFee(shippingUnit) : 0;
    const shippingFee = Math.max(0, toNumber(payload.shippingFee, derivedShippingFee));
    const totalAmount = subtotalRental + subtotalDeposit + shippingFee - discountAmount;

    const donthueCollection = getCollection('donthue');
    const chitietCollection = getCollection('chitietdonthue');

    const [lastRental] = await donthueCollection
      .find({}, { projection: { dt_ma: 1 } })
      .sort({ dt_ma: -1 })
      .limit(1)
      .toArray();

    const nextRentalId = toNumber(lastRental?.dt_ma, 0) + 1;

    const rentalDocument = {
      dt_ma: nextRentalId,
      user_ma: userId,
      diachigiaohang_ma: toNumber(payload.addressId, null),
      tt_ma: toNumber(payload.paymentMethodId, 1),
      dv_ma: toNumber(payload.shippingUnitId, null),
      vc_ma: voucherId,
      dt_ngaydat: new Date().toISOString(),
      dt_ngaybatdauthue: receiveDate,
      dt_ngayphailai: returnDate,
      dt_ngaytralai_thucte: null,
      dt_tongtienthue: subtotalRental,
      dt_tongtiencoc: subtotalDeposit,
      dt_tiencoc_hoanlai: null,
      dt_phivanchuyen: shippingFee,
      dt_giamgia: discountAmount,
      dt_tongthanhtoan: totalAmount,
      dt_trangthai: 'Chờ xác nhận',
      dt_trangthaithanhtoan: 'Chưa thanh toán',
      dt_ghichu: String(payload.note || '').trim(),
      voucherCode,
      rentalNumber: formatRentalCode(nextRentalId),
      dt_taomoi: new Date().toISOString(),
    };

    await donthueCollection.insertOne(rentalDocument);

    if (voucherId) {
      await consumeVoucherUsage({ voucherId, userId });
    }

    if (normalizedItems.length > 0) {
      const [lastDetail] = await chitietCollection
        .find({}, { projection: { id: 1 } })
        .sort({ id: -1 })
        .limit(1)
        .toArray();

      let nextDetailId = toNumber(lastDetail?.id, 0) + 1;
      const detailDocuments = normalizedItems.map((item) => {
        const detail = {
          id: nextDetailId,
          dt_ma: nextRentalId,
          sp_ma: item.productId,
          ctdt_soluong: item.quantity,
          ctdt_giathuengay: item.rentalPricePerDay,
          ctdt_tiencoc: item.depositPerItem,
          ctdt_tinhtrangtra: null,
          ctdt_ghichu: '',
          created_at: new Date().toISOString(),
        };

        nextDetailId += 1;
        return detail;
      });

      await chitietCollection.insertMany(detailDocuments);
    }

    const rentals = await mapRentalDocuments([rentalDocument]);
    res.status(201).json(rentals[0]);
  } catch (error) {
    if (error.message?.startsWith('Không tìm thấy board game') || error.message?.startsWith('Số lượng thuê vượt quá')) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

router.put('/:rentalId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const rentalId = toNumber(req.params.rentalId, 0);
    const payload = req.body || {};

    if (!rentalId) {
      return res.status(400).json({ message: 'Mã đơn thuê không hợp lệ.' });
    }

    const setPayload = {};

    if (payload.status) {
      setPayload.dt_trangthai = String(payload.status);
    }

    if (payload.paymentStatus) {
      setPayload.dt_trangthaithanhtoan = String(payload.paymentStatus);
    }

    if (payload.actualReturnDate) {
      setPayload.dt_ngaytralai_thucte = String(payload.actualReturnDate);
    }

    if (payload.refundDeposit !== undefined) {
      setPayload.dt_tiencoc_hoanlai = Math.max(0, toNumber(payload.refundDeposit, 0));
    }

    if (payload.note !== undefined) {
      setPayload.dt_ghichu = String(payload.note || '');
    }

    if (Object.keys(setPayload).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật.' });
    }

    setPayload.updated_at = new Date().toISOString();

    const collection = getCollection('donthue');
    const result = await collection.findOneAndUpdate(
      { dt_ma: rentalId },
      { $set: setPayload },
      { returnDocument: 'after' }
    );
    const updatedRental = result?.value || result;

    if (!updatedRental) {
      return res.status(404).json({ message: 'Không tìm thấy đơn thuê.' });
    }

    const rentals = await mapRentalDocuments([updatedRental]);
    res.json(rentals[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
