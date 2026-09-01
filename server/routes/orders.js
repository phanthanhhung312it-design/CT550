const express = require('express');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const { isDbConnected } = require('../config/db');
const { toNumber, validateVoucherCode, consumeVoucherUsage } = require('../services/voucherService');
const { publishOrderEvent } = require('../utils/chatSyncHub');
const { getOrderStatusStockDelta } = require('../utils/orderInventory');

const router = express.Router();
const User = require('../models/User');

function getOrdersCollection() {
  return require('mongoose').connection.collection('orders');
}

function getCollection(name) {
  return mongoose.connection.collection(name);
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

function normalizeOrderDocument(order) {
  if (!order) {
    return order;
  }

  return {
    ...order,
    customerName: repairVietnamese(order.customerName),
    phone: repairVietnamese(order.phone),
    address: repairVietnamese(order.address),
    status: repairVietnamese(order.status),
    update: repairVietnamese(order.update),
    eta: repairVietnamese(order.eta),
    paymentMethod: repairVietnamese(order.paymentMethod),
    shippingMethod: repairVietnamese(order.shippingMethod),
    note: repairVietnamese(order.note),
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
        ...item,
        name: repairVietnamese(item.name),
      }))
      : order.items,
  };
}

async function applyOrderInventoryDelta(order, previousStatus, nextStatus) {
  const deltaMap = getOrderStatusStockDelta(order, previousStatus, nextStatus);
  if (!deltaMap.size) {
    return;
  }

  for (const [productId, delta] of deltaMap.entries()) {
    const productCollection = mongoose.connection.collection('products');
    const legacyProductCollection = mongoose.connection.collection('sanpham');
    const matchOptions = [
      { id: productId },
      { sp_ma: productId },
      { _id: productId },
    ];

    const product = await productCollection.findOne({ $or: matchOptions }).catch(() => null)
      || await legacyProductCollection.findOne({ $or: matchOptions }).catch(() => null);

    if (!product) {
      continue;
    }

    const currentStock = Number(product.stock ?? product.sp_soluong ?? 0);
    const nextStock = Math.max(0, currentStock + Number(delta));

    await productCollection.updateOne(
      { _id: product._id },
      { $set: { stock: nextStock, sp_soluong: nextStock, updatedAt: new Date() } },
      { upsert: true },
    ).catch(() => null);

    await legacyProductCollection.updateOne(
      { _id: product._id },
      { $set: { sp_soluong: nextStock, stock: nextStock, updatedAt: new Date() } },
      { upsert: true },
    ).catch(() => null);
  }
}

async function listNormalizedOrders(userId) {
  const currentFilter = userId > 0 ? { userId } : {};
  const legacyFilter = userId > 0 ? { user_ma: userId } : {};

  const [orders, legacyOrders, legacyItems, addresses, paymentMethods, shippingUnits, products] = await Promise.all([
    getOrdersCollection().find(currentFilter).sort({ _id: -1 }).toArray(),
    getCollection('donhang').find(legacyFilter).sort({ dh_taomoi: -1, dh_ma: -1 }).toArray().catch(() => []),
    getCollection('chitietdonhang').find({}).toArray().catch(() => []),
    getCollection('diachigiaohang').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('thanhtoan').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('donvivanchuyen').find({}).project({ _id: 0 }).toArray().catch(() => []),
    getCollection('products').find({}).project({ _id: 0, id: 1, name: 1, image: 1, price: 1 }).toArray().catch(() => []),
  ]);

  const orderKeySet = new Set(orders.map((order) => String(order.orderNumber || order.id || '').trim()).filter(Boolean));
  const itemsByOrderKey = legacyItems.reduce((map, item) => {
    const orderKey = String(item.dh_ma || '').trim();
    if (!orderKey) {
      return map;
    }

    const rows = map.get(orderKey) || [];
    rows.push(item);
    map.set(orderKey, rows);
    return map;
  }, new Map());

  const addressMap = new Map(addresses.map((item) => [toNumber(item.dc_ma || item.id, 0), item]));
  const paymentMap = new Map(paymentMethods.map((item) => [toNumber(item.tt_ma || item.id, 0), item]));
  const shippingMap = new Map(shippingUnits.map((item) => [toNumber(item.dv_ma || item.id, 0), item]));
  const productMap = new Map(products.map((item) => [toNumber(item.id, 0), item]));

  const legacyNormalized = legacyOrders
    .filter((order) => !orderKeySet.has(String(order.dh_ma || '').trim()))
    .map((order) => {
      const orderKey = String(order.dh_ma || order.id || '').trim();
      const address = addressMap.get(toNumber(order.diachigiaohang_ma, 0));
      const payment = paymentMap.get(toNumber(order.tt_ma, 0));
      const shipping = shippingMap.get(toNumber(order.dv_ma, 0));
      const items = (itemsByOrderKey.get(orderKey) || []).map((item) => {
        const product = productMap.get(toNumber(item.sp_ma, 0));
        const quantity = Math.max(1, toNumber(item.ctdh_soluong, 1));
        const price = Math.max(0, toNumber(item.ctdh_dongia, product?.price || 0));

        return {
          productId: toNumber(item.sp_ma, 0),
          name: product?.name || item.name || `Sản phẩm #${item.sp_ma || '-'}`,
          image: product?.image || '/image/logo.jpg',
          quantity,
          price,
        };
      });

      return {
        id: orderKey,
        orderNumber: orderKey,
        userId: toNumber(order.user_ma, 0),
        customerName: order.customerName || address?.dc_hoten || `Khách hàng #${order.user_ma || '-'}`,
        phone: order.phone || address?.dc_dienthoai || '',
        address: order.address || address?.dc_diachi || [address?.dc_sonha, address?.dc_quanhuyen, address?.dc_tinh].filter(Boolean).join(', '),
        createdAt: order.dh_thoigiandathang || order.dh_taomoi || null,
        status: order.status || 'Chờ xác nhận',
        update: order.update || 'Đơn hàng đang được xử lý.',
        eta: order.eta || 'Thông tin giao hàng sẽ được cập nhật sớm.',
        paymentMethod: order.paymentMethod || payment?.tt_ten || 'COD',
        shippingMethod: order.shippingMethod || shipping?.dv_ten || 'Chưa xác định',
        tt_ma: toNumber(order.tt_ma, 0),
        voucherCode: order.voucherCode || '',
        vc_ma: toNumber(order.vc_ma || order.vc_ma_giamgia, 0),
        total: toNumber(order.total || order.totalAmount || order.dh_thanhtien, 0),
        totalAmount: toNumber(order.totalAmount || order.total || order.dh_thanhtien, 0),
        items,
      };
    });

  return [...orders.map(normalizeOrderDocument), ...legacyNormalized.map(normalizeOrderDocument)]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

router.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const userId = toNumber(req.query?.userId, 0);
    const orders = await listNormalizedOrders(userId);
    res.json(orders);
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
    const items = Array.isArray(payload.items) ? payload.items : [];
    const userId = toNumber(payload.userId, 0) || null;
    const subtotal = items.reduce((total, item) => {
      const price = Math.max(0, Number(item?.price || 0));
      const quantity = Math.max(1, Number(item?.quantity || 1));
      return total + (price * quantity);
    }, 0);

    const shippingFee = Math.max(0, Number(payload.shippingFee || 0));
    let voucherCode = '';
    let voucherDiscount = 0;
    let voucherId = null;

    if (String(payload.voucherCode || '').trim()) {
      const voucherResult = await validateVoucherCode({
        voucherCode: payload.voucherCode,
        userId,
        subtotal,
      });

      if (!voucherResult.isValid) {
        return res.status(400).json({ message: voucherResult.message || 'Voucher không hợp lệ.' });
      }

      voucherCode = voucherResult.voucher?.code || String(payload.voucherCode || '').trim().toUpperCase();
      voucherDiscount = Math.max(0, Number(voucherResult.discountAmount || 0));
      voucherId = toNumber(voucherResult.voucher?.id, 0) || null;
    }

    const totalAmount = Math.max(0, subtotal + shippingFee - voucherDiscount);

    const order = {
      orderNumber: `DH-${Date.now()}`,
      createdAt: new Date(),
      status: 'Chờ xác nhận',
      update: 'Hệ thống đã ghi nhận đơn hàng và đang chờ nhân viên xác nhận.',
      eta: payload.shippingMethod === 'pickup' ? 'Sẵn sàng nhận tại cửa hàng sau khi xác nhận' : 'Dự kiến xử lý và xác nhận trong hôm nay',
      ...payload,
      userId,
      subtotal,
      shippingFee,
      voucherCode,
      voucherDiscount,
      vc_ma: voucherId,
      total: totalAmount,
      totalAmount,
      id: payload.id || randomUUID(),
    };

    await getOrdersCollection().insertOne(order);
    publishOrderEvent({ type: 'order-created', orderId: order.id || order.orderNumber, order });

    if (voucherId) {
      await consumeVoucherUsage({ voucherId, userId });
    }

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.put('/:orderId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const { orderId } = req.params;
    const payload = req.body || {};
    const collection = getOrdersCollection();
    const filter = {
      $or: [
        { orderNumber: orderId },
        { id: orderId },
      ],
    };

    const update = {
      $set: {
        ...payload,
        status: payload.status || 'Chờ xác nhận',
        update: payload.update || 'Trạng thái đơn hàng đã được cập nhật.',
      },
    };

    // fetch previous order to detect status transitions
    const previousOrder = await collection.findOne(filter);

    const result = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    const updatedOrder = result?.value || result;

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const previousStatusValue = previousOrder?.status || '';
    const nextStatusValue = updatedOrder?.status || '';

    try {
      await applyOrderInventoryDelta(updatedOrder, previousStatusValue, nextStatusValue);
    } catch (error) {
      console.error('Error updating product stock for order lifecycle:', error.message || error);
    }

    publishOrderEvent({
      type: 'order-updated',
      orderId: updatedOrder.orderNumber || updatedOrder.id,
      previousStatus: previousStatusValue,
      status: nextStatusValue,
      order: updatedOrder,
    });

    // handle membership points when orders move to/from 'Hoàn thành'
    try {
      const prevStatus = previousOrder?.status || '';
      const newStatus = updatedOrder?.status || '';
      const prevCompleted = isCompletedOrderStatus(prevStatus);
      const newCompleted = isCompletedOrderStatus(newStatus);

      const alreadyAwarded = Boolean(previousOrder?.pointsCredited) || Boolean(updatedOrder?.pointsCredited);

      const totalPaid = toNumber(updatedOrder.totalAmount || updatedOrder.total || 0);
      const points = Math.max(0, Math.floor(totalPaid / 10000));

      const userId = toNumber(updatedOrder.userId || updatedOrder.user_ma || 0);

      if (!prevCompleted && newCompleted && points > 0 && !alreadyAwarded && userId > 0) {
        // award points
        await User.findOneAndUpdate({ id: userId }, { $inc: { membershipPoints: points } }).catch(() => null);
        await collection.updateOne(filter, { $set: { pointsCredited: true, pointsAwarded: points } }).catch(() => null);
      }

      if (prevCompleted && !newCompleted && userId > 0) {
        // order was completed before but now changed (e.g., canceled) -> remove previously awarded points if any
        const awarded = toNumber(previousOrder?.pointsAwarded || updatedOrder?.pointsAwarded || points, 0);
        if (awarded > 0) {
          await User.findOneAndUpdate({ id: userId }, { $inc: { membershipPoints: -Math.abs(awarded) } }).catch(() => null);
          await collection.updateOne(filter, { $set: { pointsCredited: false, pointsAwarded: 0 } }).catch(() => null);
        }
      }
    } catch (err) {
      // non-fatal: don't block order update on points handling
      console.error('Error handling membership points:', err.message || err);
    }

    res.json(normalizeOrderDocument(updatedOrder));
  } catch (error) {
    next(error);
  }
});

module.exports = router;