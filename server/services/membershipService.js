const mongoose = require('mongoose');
const User = require('../models/User');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrderStatus(status) {
  if (!status) return '';
  const text = String(status).toLowerCase();
  if (text.includes('huy')) return 'Đã hủy';
  if (text.includes('hoan thanh') || text.includes('hoàn thành')) return 'Hoàn thành';
  if (text.includes('giao')) return 'Đang giao';
  if (text.includes('cho xac nhan') || text.includes('chờ xác nhận') || text.includes('da dat')) return 'Chờ xác nhận';
  return 'Đang xử lý';
}

function isCompleted(status) {
  return normalizeOrderStatus(status) === 'Hoàn thành';
}

async function recomputeMembershipPoints() {
  if (!mongoose.connection) return 0;

  try {
    const orders = await mongoose.connection.collection('orders').find({}).toArray().catch(() => []);
    const legacy = await mongoose.connection.collection('donhang').find({}).toArray().catch(() => []);

    const pointsByUser = new Map();

    function add(userId, pts) {
      const id = Number(userId) || 0;
      if (!id) return;
      pointsByUser.set(id, (pointsByUser.get(id) || 0) + pts);
    }

    orders.forEach((o) => {
      if (!isCompleted(o.status || o.orderStatus)) return;
      const total = toNumber(o.totalAmount || o.total || 0);
      const pts = Math.max(0, Math.floor(total / 10000));
      add(o.userId || o.user_ma || 0, pts);
    });

    legacy.forEach((o) => {
      if (!isCompleted(o.status || o.dh_trangthai || o.trangthai)) return;
      const total = toNumber(o.dh_thanhtien || o.dh_thanhtoan || 0);
      const pts = Math.max(0, Math.floor(total / 10000));
      add(o.user_ma || o.userId || 0, pts);
    });

    const updates = [];
    for (const [userId, pts] of pointsByUser.entries()) {
      updates.push(User.findOneAndUpdate({ id: Number(userId) }, { $set: { membershipPoints: Number(pts) } }).catch(() => null));
    }

    await Promise.all(updates);
    return pointsByUser.size;
  } catch (err) {
    console.error('membershipService.recomputeMembershipPoints error:', err.message || err);
    return 0;
  }
}

module.exports = {
  recomputeMembershipPoints,
};
