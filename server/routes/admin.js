const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const { isDbConnected } = require('../config/db');
const { publishChatEvent, subscribeChatEvents, subscribeOrderEvents } = require('../utils/chatSyncHub');
const { buildChatTrainingDataset } = require('../services/chatTrainingService');
const { normalizeOrderStatus, isCompletedOrderStatus } = require('../utils/orderStatus');

const router = express.Router();

const collectionNames = ['categories', 'brands', 'promotions', 'content_pages', 'chat_messages'];

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function serializeDocument(document) {
  if (!document) {
    return null;
  }

  return {
    ...document,
    id: document.id || String(document._id),
    _id: String(document._id),
  };
}

function normalizeAdminAddress(item = {}) {
  const addressLine = String(item.dc_diachi || item.address || [item.dc_sonha, item.dc_quanhuyen, item.dc_tinh].filter(Boolean).join(', ') || '').trim();
  return {
    id: item.dc_ma || item.id || null,
    recipientName: item.dc_hoten || item.fullName || '',
    phone: item.dc_dienthoai || item.phone || '',
    addressLine,
    isDefault: Boolean(item.dc_macdinh),
    createdAt: item.created_at || item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

async function findCollectionDocument(collectionName, documentId) {
  const collection = getCollection(collectionName);
  const candidateIds = [documentId];

  if (mongoose.isValidObjectId(documentId)) {
    candidateIds.unshift(new mongoose.Types.ObjectId(documentId));
  }

  if (!Number.isNaN(Number(documentId))) {
    candidateIds.push(Number(documentId));
  }

  for (const candidateId of candidateIds) {
    const document = await collection.findOne({
      $or: [
        { _id: candidateId },
        { id: candidateId },
      ],
    });

    if (document) {
      return document;
    }
  }

  return null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveChatSessionContext(payload = {}) {
  const sessionToken = String(payload.sessionId || payload.session_token || '').trim();
  const phMa = toNumber(payload.ph_ma, 0) || null;

  if (sessionToken) {
    const session = await getCollection('chatbot_phienhoithoai').findOne({
      $or: [
        { session_token: sessionToken },
        { sessionId: sessionToken },
        { id: sessionToken },
      ],
    }).catch(() => null);

    return {
      sessionId: session?.session_token || sessionToken,
      ph_ma: session?.ph_ma || phMa,
    };
  }

  if (phMa) {
    const session = await getCollection('chatbot_phienhoithoai').findOne({
      $or: [
        { ph_ma: phMa },
        { ph_ma: String(phMa) },
      ],
    }).catch(() => null);

    return {
      sessionId: session?.session_token || null,
      ph_ma: session?.ph_ma || phMa,
    };
  }

  return {
    sessionId: null,
    ph_ma: null,
  };
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function normalizePaymentMethodLabel(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const normalized = normalizeText(text);

  if (normalized.includes('cod') || normalized.includes('thanh toan khi nhan hang')) {
    return 'COD';
  }

  if (normalized.includes('momo')) {
    return 'MOMO';
  }

  if (normalized.includes('vnpay')) {
    return 'VNPay';
  }

  if (normalized.includes('online')) {
    return 'Thanh toán online';
  }

  return text.length <= 4 ? text.toUpperCase() : text;
}

function getMonthBucketKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthBucketLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function parseDateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function getDateRange(preset, startDate, endDate, anchorDate = new Date()) {
  const now = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? new Date(anchorDate) : new Date();
  const today = startOfDay(now);
  const rangePreset = preset || 'month';
  const explicitStart = parseDateValue(startDate);
  const explicitEnd = parseDateValue(endDate);

  if (explicitStart && explicitEnd) {
    return { preset: rangePreset, from: startOfDay(explicitStart), to: endOfDay(explicitEnd) };
  }

  if (rangePreset === 'all') {
    return { preset: rangePreset, from: new Date(0), to: endOfDay(now) };
  }

  if (rangePreset === 'today' || rangePreset === 'day') {
    return { preset: 'day', from: today, to: endOfDay(now) };
  }

  if (rangePreset === 'week') {
    const day = today.getDay() || 7;
    const from = new Date(today);
    from.setDate(today.getDate() - day + 1);
    return { preset: rangePreset, from, to: endOfDay(now) };
  }

  if (rangePreset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { preset: rangePreset, from, to: endOfDay(now) };
  }

  if (rangePreset === 'custom') {
    const customFrom = explicitStart || new Date(now.getFullYear(), now.getMonth(), 1);
    const customTo = explicitEnd || now;
    return { preset: rangePreset, from: startOfDay(customFrom), to: endOfDay(customTo) };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { preset: 'month', from, to: endOfDay(now) };
}

function isBetween(date, from, to) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date >= from && date <= to;
}

function formatDayLabel(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function weekOfYear(date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
}

router.get('/reports', async (req, res, next) => {
  try {
    const { preset = 'month', startDate, endDate } = req.query;
    const anchorDate = parseDateValue(startDate) || parseDateValue(endDate) || new Date();
    const range = getDateRange(preset, startDate, endDate, anchorDate);

    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Không thể tạo báo cáo vì cơ sở dữ liệu chưa sẵn sàng.' });
    }

    const [donhangRows, orderRows, chitietRows, sanphamRows, productsRows, usersRows, thanhtoanRows, voucherRows, chitietNhapRows, phieunhapRows] = await Promise.all([
      getCollection('donhang').find({}).toArray().catch(() => []),
      getCollection('orders').find({}).toArray().catch(() => []),
      getCollection('chitietdonhang').find({}).toArray().catch(() => []),
      getCollection('sanpham').find({}).toArray().catch(() => []),
      getCollection('products').find({}).toArray().catch(() => []),
      getCollection('users').find({}).toArray().catch(() => []),
      getCollection('thanhtoan').find({}).toArray().catch(() => []),
      getCollection('voucher').find({}).toArray().catch(() => []),
      getCollection('chitietnhap').find({}).toArray().catch(() => []),
      getCollection('phieunhap').find({}).toArray().catch(() => []),
    ]);

    const chitietByOrderKey = new Map();
    chitietRows.forEach((detail) => {
      const orderKey = String(detail.dh_ma || '').trim();
      if (!orderKey) {
        return;
      }

      const currentItems = chitietByOrderKey.get(orderKey) || [];
      currentItems.push(detail);
      chitietByOrderKey.set(orderKey, currentItems);
    });

    const mappedOrdersFromDonhang = donhangRows.map((order, index) => {
      const orderKey = String(order.dh_ma || `DH-LGCY-${index + 1}`);
      return {
        key: orderKey,
        orderId: orderKey,
        date: parseDateValue(order.dh_thoigiandathang || order.dh_taomoi || order.createdAt),
        amount: toNumber(order.dh_thanhtien, 0),
        status: normalizeOrderStatus(order.status || order.dh_trangthai || 'Chờ xác nhận'),
        userId: toNumber(order.user_ma, 0),
        paymentId: toNumber(order.tt_ma, 0),
        paymentMethod: '',
        voucherId: order.vc_ma ?? null,
        items: (chitietByOrderKey.get(orderKey) || []).map((detail) => ({
          productId: detail?.sp_ma,
          quantity: detail?.ctdh_soluong,
          price: detail?.ctdh_dongia,
        })),
      };
    });

    const mappedOrders = orderRows.map((order, index) => {
      const orderKey = String(order.orderNumber || order.id || `DH-RAW-${index + 1}`);
      return {
        key: orderKey,
        orderId: orderKey,
        date: parseDateValue(order.createdAt || order.date || order.dh_thoigiandathang),
        amount: toNumber(order.total || order.totalAmount || order.dh_thanhtien, 0),
        status: normalizeOrderStatus(order.status || 'Chờ xác nhận'),
        userId: toNumber(order.user_ma || order.userId, 0),
        paymentId: toNumber(order.tt_ma, 0),
        paymentMethod: String(order.paymentMethod || order.paymentMethodName || order.tt_ten || '').trim(),
        voucherId: order.vc_ma ?? null,
        items: Array.isArray(order.items)
          ? order.items.map((item) => ({
            productId: item?.productId || item?.sp_ma,
            quantity: item?.quantity || item?.ctdh_soluong,
            price: item?.price || item?.ctdh_dongia,
          }))
          : [],
      };
    });

    const orderMap = new Map();
    [...mappedOrdersFromDonhang, ...mappedOrders].forEach((order) => {
      const existing = orderMap.get(order.key);
      if (!existing) {
        orderMap.set(order.key, order);
        return;
      }

      orderMap.set(order.key, {
        ...existing,
        ...order,
        items: Array.isArray(existing.items) && existing.items.length > 0 ? existing.items : order.items,
      });
    });

    const allOrders = [...orderMap.values()];
    const ordersInRange = allOrders.filter((order) => isBetween(order.date, range.from, range.to));
    const completedOrders = ordersInRange.filter((order) => isCompletedOrderStatus(order.status));
    const orderKeysInRange = new Set(ordersInRange.map((order) => String(order.orderId)));

    const receiptDateMap = new Map();
    phieunhapRows.forEach((receipt) => {
      const receiptId = toNumber(receipt.pn_ma || receipt.id, 0);
      if (!receiptId) {
        return;
      }
      const receiptDate = parseDateValue(receipt.pn_ngaynhap || receipt.pn_ngayxacnhan || receipt.pn_taomoi || receipt.createdAt);
      receiptDateMap.set(receiptId, receiptDate || new Date(0));
    });

    const totalPurchaseCost = chitietNhapRows.reduce((sum, detail) => {
      const receiptId = toNumber(detail.pn_ma, 0);
      const receiptDate = receiptDateMap.get(receiptId);
      if (!receiptDate || !isBetween(receiptDate, range.from, range.to)) {
        return sum;
      }

      const quantity = Math.max(0, toNumber(detail.ctn_soluong || detail.quantity, 0));
      const unitPrice = Math.max(0, toNumber(detail.ctn_dongia || detail.unitPrice || detail.price, 0));
      return sum + (quantity * unitPrice);
    }, 0);

    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.amount, 0);
    const totalProfit = totalRevenue - totalPurchaseCost;
    const statusBuckets = {
      'Chờ xác nhận': 0,
      'Đang giao': 0,
      'Hoàn thành': 0,
      'Đã hủy': 0,
      'Đang xử lý': 0,
    };
    ordersInRange.forEach((order) => {
      statusBuckets[order.status] = (statusBuckets[order.status] || 0) + 1;
    });

    const byDayMap = new Map();
    const byWeekMap = new Map();
    const byMonthMap = new Map();
    const byYearMap = new Map();
    const monthlyRevenueMap = new Map();
    const monthlyOrderCountMap = new Map();

    completedOrders.forEach((order) => {
      if (!order.date) {
        return;
      }

      const dayLabel = formatDayLabel(order.date);
      const weekLabel = `Tuần ${weekOfYear(order.date)}`;
      const monthKey = getMonthBucketKey(order.date);
      const monthLabel = getMonthBucketLabel(order.date);
      const yearLabel = String(order.date.getFullYear());

      byDayMap.set(dayLabel, (byDayMap.get(dayLabel) || 0) + order.amount);
      byWeekMap.set(weekLabel, (byWeekMap.get(weekLabel) || 0) + order.amount);
      byMonthMap.set(monthLabel, (byMonthMap.get(monthLabel) || 0) + order.amount);
      byYearMap.set(yearLabel, (byYearMap.get(yearLabel) || 0) + order.amount);
      if (monthKey) {
        monthlyRevenueMap.set(monthKey, {
          sortKey: monthKey,
          label: monthLabel,
          revenue: (monthlyRevenueMap.get(monthKey)?.revenue || 0) + order.amount,
        });
        monthlyOrderCountMap.set(monthKey, {
          sortKey: monthKey,
          label: monthLabel,
          count: (monthlyOrderCountMap.get(monthKey)?.count || 0) + 1,
        });
      }
    });

    const paymentNameMap = new Map(thanhtoanRows.map((item) => [toNumber(item.tt_ma || item.id, 0), item.tt_ten || item.name || `PTTT #${item.tt_ma || item.id}`]));
    const paymentCounts = new Map();
    ordersInRange.forEach((order) => {
      const paymentName = paymentNameMap.get(order.paymentId) || normalizePaymentMethodLabel(order.paymentMethod) || 'COD';
      paymentCounts.set(paymentName, (paymentCounts.get(paymentName) || 0) + 1);
    });

    const productNameMap = new Map();
    sanphamRows.forEach((item) => {
      productNameMap.set(toNumber(item.sp_ma, 0), item.sp_ten || `Sản phẩm #${item.sp_ma}`);
    });
    productsRows.forEach((item) => {
      productNameMap.set(toNumber(item.id, 0), item.name || `Sản phẩm #${item.id}`);
    });

    const salesMap = new Map();
    completedOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item, index) => {
        const rawProductId = item?.productId ?? item?.product_id ?? item?.sp_ma ?? item?.id ?? item?._id;
        const productId = Number(rawProductId);
        const quantity = toNumber(item?.quantity ?? item?.ctdh_soluong, 0);
        const unitPrice = toNumber(item?.price ?? item?.ctdh_dongia ?? item?.dongia, 0);
        const revenue = quantity * unitPrice;

        if (!Number.isFinite(productId) || productId <= 0) {
          const fallbackName = item?.name || item?.productName || item?.sp_ten || 'Sản phẩm không xác định';
          const fallbackKey = `${fallbackName}-${index}`;
          const current = salesMap.get(fallbackKey) || {
            productId: null,
            name: fallbackName,
            quantity: 0,
            revenue: 0,
          };
          current.quantity += quantity;
          current.revenue += revenue;
          salesMap.set(fallbackKey, current);
          return;
        }

        const current = salesMap.get(productId) || {
          productId,
          name: productNameMap.get(productId) || `Sản phẩm #${productId}`,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += quantity;
        current.revenue += revenue;
        salesMap.set(productId, current);
      });
    });

    const topSelling = [...salesMap.values()]
      .filter((item) => Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0)
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        name: item?.name || 'Sản phẩm không xác định',
      }));

    const inventoryMap = new Map();
    const upsertInventoryItem = (productId, name, stock) => {
      if (!productId) {
        return;
      }

      const nextStock = toNumber(stock, 0);
      const existing = inventoryMap.get(productId);
      if (!existing) {
        inventoryMap.set(productId, {
          productId,
          name,
          stock: nextStock,
        });
        return;
      }

      inventoryMap.set(productId, {
        ...existing,
        name: name || existing.name,
        stock: Math.max(existing.stock || 0, nextStock),
      });
    };

    sanphamRows.forEach((item) => {
      upsertInventoryItem(toNumber(item.sp_ma, 0), item.sp_ten || `Sản phẩm #${item.sp_ma}`, item.sp_soluong);
    });
    productsRows.forEach((item) => {
      upsertInventoryItem(toNumber(item.id, 0), item.name || `Sản phẩm #${item.id}`, item.stock ?? item.sp_soluong);
    });

    const outOfStock = [...inventoryMap.values()].filter((item) => item.stock <= 0);

    const customerRows = usersRows.filter((user) => normalizeText(user.role) === 'customer');
    const newCustomers = customerRows.filter((user) => {
      const date = parseDateValue(user.createdAt || user.ngaydangky || user.created_at);
      return isBetween(date, range.from, range.to);
    }).length;

    const spendMap = new Map();
    ordersInRange.forEach((order) => {
      const userId = order.userId;
      if (!userId) {
        return;
      }

      spendMap.set(userId, (spendMap.get(userId) || 0) + order.amount);
    });

    const topCustomers = [...spendMap.entries()]
      .map(([userId, totalSpend]) => {
        const user = customerRows.find((item) => toNumber(item.id, 0) === userId);
        return {
          userId,
          customerName: user?.displayName || user?.fullName || user?.username || `Khách hàng #${userId}`,
          totalSpend,
        };
      })
      .sort((left, right) => right.totalSpend - left.totalSpend)
      .slice(0, 10);

    const voucherMap = new Map(voucherRows.map((item) => [toNumber(item.vc_ma || item.id, 0), item.vc_code || item.code || `VC-${item.vc_ma || item.id}`]));
    const voucherUsage = new Map();
    let revenueWithVoucher = 0;
    let ordersWithVoucher = 0;

    ordersInRange.forEach((order) => {
      const voucherId = toNumber(order.voucherId, 0);
      if (!voucherId) {
        return;
      }

      const voucherCode = voucherMap.get(voucherId) || `VC-${voucherId}`;
      const current = voucherUsage.get(voucherCode) || { code: voucherCode, usageCount: 0, revenue: 0 };
      current.usageCount += 1;
      current.revenue += order.amount;
      voucherUsage.set(voucherCode, current);

      revenueWithVoucher += order.amount;
      ordersWithVoucher += 1;
    });

    const report = {
      range: {
        preset: range.preset,
        startDate: range.from.toISOString(),
        endDate: range.to.toISOString(),
      },
      summary: {
        totalRevenue,
        totalProfit,
        totalOrders: ordersInRange.length,
        totalCustomers: customerRows.length,
        totalProducts: Math.max(sanphamRows.length, productsRows.length),
      },
      revenue: {
        byDay: [...byDayMap.entries()].map(([label, revenue]) => ({ label, revenue })),
        byWeek: [...byWeekMap.entries()].map(([label, revenue]) => ({ label, revenue })),
        byMonth: [...byMonthMap.entries()].map(([label, revenue]) => ({ label, revenue })),
        byYear: [...byYearMap.entries()].map(([label, revenue]) => ({ label, revenue })),
        monthlyComparison: [...monthlyRevenueMap.values()].sort((left, right) => String(left.sortKey).localeCompare(String(right.sortKey))),
      },
      orders: {
        total: ordersInRange.length,
        pending: statusBuckets['Chờ xác nhận'] || 0,
        shipping: statusBuckets['Đang giao'] || 0,
        completed: statusBuckets['Hoàn thành'] || 0,
        cancelled: statusBuckets['Đã hủy'] || 0,
        statusDistribution: [
          { label: 'Chờ xác nhận', value: statusBuckets['Chờ xác nhận'] || 0 },
          { label: 'Đang giao', value: statusBuckets['Đang giao'] || 0 },
          { label: 'Hoàn thành', value: statusBuckets['Hoàn thành'] || 0 },
          { label: 'Đã hủy', value: statusBuckets['Đã hủy'] || 0 },
          { label: 'Đang xử lý', value: statusBuckets['Đang xử lý'] || 0 },
        ],
        monthlyCount: [...monthlyOrderCountMap.values()].sort((left, right) => String(left.sortKey).localeCompare(String(right.sortKey))),
      },
      products: {
        topSelling,
        outOfStock,
      },
      customers: {
        total: customerRows.length,
        newCustomers,
        topSpenders: topCustomers,
      },
      payments: {
        methods: [...paymentCounts.entries()].map(([method, count]) => ({
          method,
          count,
          ratio: ordersInRange.length > 0 ? Number(((count / ordersInRange.length) * 100).toFixed(2)) : 0,
        })),
      },
      promotions: {
        topVouchers: [...voucherUsage.values()].sort((left, right) => right.usageCount - left.usageCount),
        revenueWithVoucher,
        usageRate: ordersInRange.length > 0 ? Number(((ordersWithVoucher / ordersInRange.length) * 100).toFixed(2)) : 0,
      },
    };

    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        products: 0,
        customers: 0,
        employees: 0,
        orders: 0,
        rentals: 0,
        categories: 0,
        brands: 0,
        promotions: 0,
        reviews: 0,
        content_pages: 0,
        chat_messages: 0,
        orderStatus: [],
        revenue: 0,
      });
    }

    const customerFilter = { role: { $regex: /^customer$/i } };
    const [products, customers, employees, orders, rentals, reviews, ...counts] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments(customerFilter),
      getCollection('employees').countDocuments(),
      getCollection('orders').countDocuments(),
      getCollection('donthue').countDocuments(),
      getCollection('danhgia').countDocuments(),
      ...collectionNames.map((name) => getCollection(name).countDocuments()),
    ]);

    const orderStatus = await getCollection('orders').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    const revenueCursor = await getCollection('orders').aggregate([
      {
        $project: {
          numericTotal: {
            $cond: [
              { $isNumber: '$total' },
              '$total',
              {
                $cond: [
                  { $isNumber: '$totalAmount' },
                  '$totalAmount',
                  0,
                ],
              },
            ],
          },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$numericTotal' } } },
    ]).toArray();

    res.json({
      products,
      customers,
      orders,
      rentals,
      employees,
      categories: counts[0],
      brands: counts[1],
      promotions: counts[2],
      reviews,
      content_pages: counts[3],
      chat_messages: counts[4],
      orderStatus,
      revenue: revenueCursor[0]?.revenue || 0,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const addressRows = await getCollection('diachigiaohang')
      .find({})
      .project({ _id: 0 })
      .toArray()
      .catch(() => []);

    const addressesByUserId = addressRows.reduce((map, address) => {
      const userId = Number(address.user_ma || address.userId || 0);
      if (userId > 0) {
        const items = map.get(userId) || [];
        items.push(normalizeAdminAddress(address));
        map.set(userId, items);
      }
      return map;
    }, new Map());

    const users = await User.find({ role: { $regex: /^customer$/i } }).sort({ createdAt: -1 }).lean();
    res.json(users.map((user) => {
      const userAddresses = addressesByUserId.get(user.id) || [];
      const defaultAddress = userAddresses.find((item) => item.isDefault) || userAddresses[0] || null;

      return {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        username: user.username,
        phone: user.phone,
        role: user.role,
        isLocked: Boolean(user.isLocked),
        createdAt: user.createdAt,
        membershipPoints: Number(user.membershipPoints || user.points || 0),
        addresses: userAddresses,
        address: defaultAddress?.addressLine || user.address || 'Chưa cập nhật',
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/password', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const userId = Number(req.params.id);
    const newPassword = String(req.body?.newPassword || '').trim();

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updatedUser = await User.findOneAndUpdate(
      { id: userId, role: { $regex: /^customer$/i } },
      { $set: { password: passwordHash, passwordHash } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
    }

    res.json({ id: updatedUser.id, message: 'Mật khẩu đã được cấp lại.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/lock', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const nextLockedState = Boolean(req.body?.isLocked);
    const updatedUser = await User.findOneAndUpdate(
      { id: Number(req.params.id), role: { $regex: /^customer$/i } },
      { $set: { isLocked: nextLockedState } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: updatedUser.id,
      displayName: updatedUser.displayName,
      email: updatedUser.email,
      username: updatedUser.username,
      phone: updatedUser.phone,
      role: updatedUser.role,
      isLocked: Boolean(updatedUser.isLocked),
      createdAt: updatedUser.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

// Recompute membership points for all users from completed orders (backfill/reconcile)
router.post('/membership/recompute', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const orders = await getCollection('orders').find({}).toArray().catch(() => []);
    const legacyOrders = await getCollection('donhang').find({}).toArray().catch(() => []);

    const pointsByUser = new Map();

    function addPointsFor(userId, pts) {
      if (!userId) return;
      const key = Number(userId) || 0;
      if (key <= 0) return;
      pointsByUser.set(key, (pointsByUser.get(key) || 0) + pts);
    }

    // modern orders
    orders.forEach((order) => {
      const status = order.status || order.orderStatus || '';
      if (!isCompletedOrderStatus(status)) return;
      const totalPaid = toNumber(order.totalAmount || order.total || 0);
      const pts = Math.max(0, Math.floor(totalPaid / 10000));
      const uid = Number(order.userId || order.user_ma || 0);
      addPointsFor(uid, pts);
    });

    // legacy orders
    legacyOrders.forEach((order) => {
      const status = order.status || order.dh_trangthai || order.trangthai || '';
      if (!isCompletedOrderStatus(status)) return;
      const totalPaid = toNumber(order.dh_thanhtien || order.dh_thanhtoan || order.dh_thanhtien || 0);
      const pts = Math.max(0, Math.floor(totalPaid / 10000));
      const uid = Number(order.user_ma || order.userId || 0);
      addPointsFor(uid, pts);
    });

    // Update users
    const updates = [];
    for (const [userId, totalPoints] of pointsByUser.entries()) {
      updates.push(User.findOneAndUpdate({ id: Number(userId) }, { $set: { membershipPoints: Number(totalPoints) } }).catch(() => null));
    }
    await Promise.all(updates);

    // Optionally mark orders with pointsAwarded/pointsCredited for modern orders
    // We'll set these fields for transparency without changing numeric totals (idempotent)
    const bulkModern = orders.filter((order) => isCompletedOrderStatus(order.status || order.orderStatus || '')).map((order) => {
      const totalPaid = toNumber(order.totalAmount || order.total || 0);
      const pts = Math.max(0, Math.floor(totalPaid / 10000));
      return { filter: { _id: order._id }, update: { $set: { pointsCredited: true, pointsAwarded: pts } } };
    });
    for (const entry of bulkModern) {
      await getCollection('orders').updateOne(entry.filter, entry.update).catch(() => null);
    }

    // Legacy orders: mark with pointsAwarded/pointsCredited if possible
    const bulkLegacy = legacyOrders.filter((order) => isCompletedOrderStatus(order.status || order.dh_trangthai || '')).map((order) => {
      const totalPaid = toNumber(order.dh_thanhtien || order.dh_thanhtoan || 0);
      const pts = Math.max(0, Math.floor(totalPaid / 10000));
      const filter = {};
      if (order.dh_ma) filter.dh_ma = order.dh_ma;
      else if (order._id) filter._id = order._id;
      return { filter, update: { $set: { pointsCredited: true, pointsAwarded: pts } } };
    });
    for (const entry of bulkLegacy) {
      if (Object.keys(entry.filter).length === 0) continue;
      await getCollection('donhang').updateOne(entry.filter, entry.update).catch(() => null);
    }

    res.json({ message: 'Recomputed membership points', usersUpdated: pointsByUser.size });
  } catch (error) {
    next(error);
  }
});

router.get('/collections/:collectionName', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const { collectionName } = req.params;
    const documents = await getCollection(collectionName).find({}).sort({ createdAt: -1 }).toArray();
    res.json(documents.map(serializeDocument));
  } catch (error) {
    next(error);
  }
});

router.post('/collections/:collectionName', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const { collectionName } = req.params;
    const payload = req.body || {};
    const result = await getCollection(collectionName).insertOne({
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (collectionName === 'chatbot_tinnhan') {
      const sessionContext = await resolveChatSessionContext(payload);
      publishChatEvent({
        type: 'message-created',
        sessionId: sessionContext.sessionId,
        ph_ma: sessionContext.ph_ma,
        senderType: payload.tn_nguoigui === 2 ? 'employee' : payload.tn_nguoigui === 0 ? 'bot' : 'customer',
      });
    }

    res.status(201).json({
      ...payload,
      _id: String(result.insertedId),
      id: payload.id || String(result.insertedId),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/collections/:collectionName/:documentId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const { collectionName, documentId } = req.params;
    const payload = req.body || {};
    const document = await findCollectionDocument(collectionName, documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const collection = getCollection(collectionName);
    const filter = document._id ? { _id: document._id } : { id: document.id };

    const updateResult = await collection.updateOne(
      filter,
      { $set: { ...payload, updatedAt: new Date() } }
    );

    if (!updateResult.matchedCount) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const updatedDocument = await collection.findOne(filter);

    if (collectionName === 'chatbot_phienhoithoai') {
      const sessionContext = await resolveChatSessionContext(updatedDocument || payload);
      publishChatEvent({
        type: 'session-updated',
        sessionId: sessionContext.sessionId,
        ph_ma: sessionContext.ph_ma,
        isHumanAssigned: Number((updatedDocument || payload)?.ph_da_chuyenchonv) === 1 || Number((updatedDocument || payload)?.nv_ma || 0) > 0,
      });
    }

    res.json(serializeDocument(updatedDocument));
  } catch (error) {
    next(error);
  }
});

router.get('/chatbot/training-dataset', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const limit = toNumber(req.query.limit, 500) || 500;
    const samples = await buildChatTrainingDataset({ limit });
    res.json({ generatedAt: new Date().toISOString(), count: samples.length, samples });
  } catch (error) {
    next(error);
  }
});

router.get('/chatbot/stream', async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ message: 'Database is not connected' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  // Admin console loads the whole session list, so forward every chat update unfiltered.
  const unsubscribe = subscribeChatEvents((event) => {

    res.write('event: chat-event\n');
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

router.get('/orders/stream', async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ message: 'Database is not connected' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  const unsubscribe = subscribeOrderEvents((event) => {
    res.write('event: order-event\n');
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

router.delete('/collections/:collectionName/:documentId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const { collectionName, documentId } = req.params;
    const document = await findCollectionDocument(collectionName, documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const collection = getCollection(collectionName);
    const filter = document._id ? { _id: document._id } : { id: document.id };

    const result = await collection.deleteOne(filter);

    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;