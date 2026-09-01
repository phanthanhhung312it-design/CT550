const mongoose = require('mongoose');

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapSenderLabel(tnNguoiGui) {
  const value = toNumber(tnNguoiGui, 1);
  if (value === 0) {
    return 'bot';
  }
  if (value === 2) {
    return 'employee';
  }
  return 'customer';
}

// Gom hội thoại + phản hồi nhân viên + dữ liệu sản phẩm/voucher/đơn hàng/đơn thuê liên quan
// thành các mẫu (question -> answer) làm nguồn huấn luyện cho Hybrid Recommendation (ML + LLM).
async function buildChatTrainingDataset({ limit = 500 } = {}) {
  const [sessions, messages, products, vouchers, orders, rentals, users] = await Promise.all([
    getCollection('chatbot_phienhoithoai').find({}).toArray().catch(() => []),
    getCollection('chatbot_tinnhan').find({}).sort({ tn_ma: 1 }).toArray().catch(() => []),
    getCollection('products').find({}).toArray().catch(() => []),
    getCollection('vouchers').find({}).toArray().catch(() => []),
    getCollection('orders').find({}).toArray().catch(() => []),
    getCollection('donthue').find({}).toArray().catch(() => []),
    getCollection('customers').find({}).toArray().catch(() => []),
  ]);

  const sessionsByPhMa = new Map(sessions.map((session) => [toNumber(session.ph_ma, session.ph_ma), session]));
  const productsById = new Map(products.map((product) => [String(product.id ?? product._id), product]));
  const messagesByPhMa = new Map();

  messages.forEach((message) => {
    const phMa = toNumber(message.ph_ma, message.ph_ma);
    if (!messagesByPhMa.has(phMa)) {
      messagesByPhMa.set(phMa, []);
    }
    messagesByPhMa.get(phMa).push(message);
  });

  const samples = [];

  messagesByPhMa.forEach((sessionMessages, phMa) => {
    const session = sessionsByPhMa.get(phMa) || {};
    const userId = toNumber(session.user_ma ?? session.userId, 0) || null;
    const customer = users.find((user) => toNumber(user.id ?? user._id, 0) === userId) || null;
    const userOrders = orders.filter((order) => String(order.userId || order.user_ma || '') === String(userId));
    const userRentals = rentals.filter((rental) => String(rental.userId || rental.user_ma || '') === String(userId));

    let pendingQuestion = null;

    sessionMessages.forEach((message) => {
      const sender = mapSenderLabel(message.tn_nguoigui);
      const text = String(message.tn_noidung || '').trim();
      if (!text) {
        return;
      }

      if (sender === 'customer') {
        pendingQuestion = { text, createdAt: message.created_at };
        return;
      }

      if ((sender === 'bot' || sender === 'employee') && pendingQuestion) {
        const recommendedProducts = Array.isArray(message.recommendations)
          ? message.recommendations
            .map((item) => productsById.get(String(item.id)) || item)
            .map((item) => ({ id: item.id, name: item.name, category: item.category }))
          : [];

        samples.push({
          ph_ma: phMa,
          sessionId: session.session_token || session.sessionId || null,
          question: pendingQuestion.text,
          answer: text,
          answeredBy: sender,
          extractedPreferences: message.extractedPreferences || null,
          recommendedProducts,
          context: {
            userId,
            customerName: customer?.displayName || customer?.fullName || customer?.username || null,
            appliedVoucherCodes: vouchers
              .filter((voucher) => String(voucher.usedByUserId || '') === String(userId))
              .map((voucher) => voucher.code || voucher.vc_ma)
              .filter(Boolean),
            recentOrderStatuses: userOrders.slice(0, 3).map((order) => order.status),
            recentRentalStatuses: userRentals.slice(0, 3).map((rental) => rental.status),
          },
          createdAt: message.created_at || pendingQuestion.createdAt,
        });

        pendingQuestion = null;
      }
    });
  });

  return samples
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, limit);
}

module.exports = { buildChatTrainingDataset };
