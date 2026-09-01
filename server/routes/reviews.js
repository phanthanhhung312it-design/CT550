const express = require('express');
const mongoose = require('mongoose');
const { isDbConnected } = require('../config/db');

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

function getReviewStatus(value) {
  const status = String(value || '').trim();
  return status || 'Hiển thị';
}

function repairVietnamese(value) {
  const text = String(value || '');
  const dictionary = {
    'Hi?n th?': 'Hiển thị',
    'Hien thi': 'Hiển thị',
    'Cho duyet': 'Chờ duyệt',
    'Ch? duy?t': 'Chờ duyệt',
    'An': 'Ẩn',
  };

  return dictionary[text] || text;
}

function normalizeReviewStatus(value) {
  const normalized = normalizeText(repairVietnamese(value));
  const flattened = normalized.replace(/[^a-z]/g, '');

  if (flattened.includes('choduyet') || flattened.includes('chduyt') || normalized.includes('pending')) {
    return 'Chờ duyệt';
  }

  if (flattened === 'an' || flattened.includes('an')) {
    return 'Ẩn';
  }

  if (flattened.includes('hienthi') || flattened.includes('hinth') || normalized.includes('approved')) {
    return 'Hiển thị';
  }

  // Any unrecognized/malformed status is treated as visible to keep UI consistent.
  return 'Hiển thị';
}

function isCountedReviewStatus(value) {
  return normalizeReviewStatus(value) !== 'Ẩn';
}

function isCompletedOrderStatus(value) {
  const status = normalizeText(value);
  return ['hoan thanh', 'da giao', 'completed'].some((item) => status.includes(item));
}

async function mapReviewDocuments(reviewRows) {
  if (!isDbConnected() || reviewRows.length === 0) {
    return [];
  }

  const [users, products, orders] = await Promise.all([
    getCollection('users').find({}).project({ _id: 0, id: 1, username: 1, displayName: 1, fullName: 1, email: 1 }).toArray().catch(() => []),
    getCollection('products').find({}).project({ _id: 0, id: 1, name: 1, image: 1 }).toArray().catch(() => []),
    getCollection('orders').find({}).project({ _id: 0, id: 1, orderNumber: 1, status: 1 }).toArray().catch(() => []),
  ]);

  const userMap = new Map(users.map((user) => [toNumber(user.id, -1), user]));
  const productMap = new Map(products.map((product) => [toNumber(product.id, -1), product]));
  const orderMap = new Map();
  orders.forEach((order) => {
    if (order.id) {
      orderMap.set(String(order.id), order);
    }
    if (order.orderNumber) {
      orderMap.set(String(order.orderNumber), order);
    }
  });

  return reviewRows.map((review) => {
    const reviewId = toNumber(review.dg_ma || review.id, 0);
    const user = userMap.get(toNumber(review.user_ma, -1));
    const product = productMap.get(toNumber(review.sp_ma, -1));
    const order = orderMap.get(String(review.dh_ma || ''));

    return {
      id: reviewId,
      reviewCode: `DG-${String(reviewId).padStart(5, '0')}`,
      userId: toNumber(review.user_ma, 0),
      customerName: user?.displayName || user?.fullName || user?.username || `Khách hàng #${review.user_ma || '-'}`,
      customerEmail: user?.email || '',
      productId: toNumber(review.sp_ma, 0),
      productName: product?.name || review.productName || `Sản phẩm #${review.sp_ma || '-'}`,
      productImage: product?.image || '/image/catan.jpg',
      orderId: review.dh_ma || '',
      orderStatus: order?.status || '',
      rating: Math.min(5, Math.max(1, toNumber(review.dg_sosao, 5))),
      content: String(review.dg_noidung || review.content || '').trim(),
      status: normalizeReviewStatus(review.dg_trangthai || review.status),
      createdAt: review.dg_taomoi || review.createdAt || new Date().toISOString(),
    };
  });
}

async function recomputeProductStats(productId) {
  if (!isDbConnected() || !productId) {
    return;
  }

  const reviewRows = await getCollection('danhgia').find({ sp_ma: productId }).toArray();
  const visibleReviews = reviewRows.filter((item) => isCountedReviewStatus(item.dg_trangthai || item.status));

  const reviewCount = visibleReviews.length;
  const avgRating = reviewCount > 0
    ? visibleReviews.reduce((sum, item) => sum + toNumber(item.dg_sosao, 0), 0) / reviewCount
    : 0;

  await getCollection('products').updateOne(
    { id: productId },
    { $set: { reviews: reviewCount, rating: Number(avgRating.toFixed(1)) } }
  ).catch(() => {});
}

router.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const { userId, keyword, rating, status } = req.query;
    const reviewRows = await getCollection('danhgia').find({}).sort({ dg_taomoi: -1, dg_ma: -1 }).toArray();
    let reviews = await mapReviewDocuments(reviewRows);

    if (userId) {
      reviews = reviews.filter((review) => String(review.userId) === String(userId));
    }

    if (keyword) {
      const query = normalizeText(keyword);
      reviews = reviews.filter((review) => normalizeText([
        review.reviewCode,
        review.customerName,
        review.productName,
      ].join(' ')).includes(query));
    }

    if (rating) {
      const stars = toNumber(rating, 0);
      if (stars > 0) {
        reviews = reviews.filter((review) => review.rating === stars);
      }
    }

    if (status && status !== 'Tất cả') {
      reviews = reviews.filter((review) => normalizeText(review.status) === normalizeText(status));
    }

    res.json(reviews);
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
    const productId = toNumber(payload.productId, 0);
    const rating = Math.min(5, Math.max(1, toNumber(payload.rating, 0)));
    const content = String(payload.content || '').trim();
    const orderId = String(payload.orderId || '').trim();

    if (!userId || !productId || !orderId || !content || !rating) {
      return res.status(400).json({ message: 'Thiếu thông tin để gửi đánh giá.' });
    }

    const order = await getCollection('orders').findOne({
      $or: [
        { id: orderId },
        { orderNumber: orderId },
      ],
    });

    if (order && !isCompletedOrderStatus(order.status)) {
      return res.status(400).json({ message: 'Chỉ có thể đánh giá sau khi đơn hàng hoàn thành.' });
    }

    const reviewCollection = getCollection('danhgia');
    const existingReview = await reviewCollection.findOne({
      user_ma: userId,
      sp_ma: productId,
      dh_ma: orderId,
    });

    if (existingReview) {
      await reviewCollection.updateOne(
        { dg_ma: existingReview.dg_ma },
        {
          $set: {
            dg_sosao: rating,
            dg_noidung: content,
            dg_trangthai: 'Chờ duyệt',
            dg_taocapnhat: new Date().toISOString(),
          },
        }
      );

      await recomputeProductStats(productId);

      const [review] = await mapReviewDocuments([{ ...existingReview, dg_sosao: rating, dg_noidung: content, dg_trangthai: 'Chờ duyệt' }]);
      return res.status(200).json(review);
    }

    const [lastReview] = await reviewCollection
      .find({}, { projection: { dg_ma: 1 } })
      .sort({ dg_ma: -1 })
      .limit(1)
      .toArray();

    const nextReviewId = toNumber(lastReview?.dg_ma, 0) + 1;

    const reviewDoc = {
      dg_ma: nextReviewId,
      user_ma: userId,
      sp_ma: productId,
      dh_ma: orderId,
      dg_sosao: rating,
      dg_noidung: content,
      dg_trangthai: 'Chờ duyệt',
      dg_taomoi: new Date().toISOString(),
    };

    await reviewCollection.insertOne(reviewDoc);
    await recomputeProductStats(productId);

    const [review] = await mapReviewDocuments([reviewDoc]);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

router.patch('/:reviewId/status', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const reviewId = toNumber(req.params.reviewId, 0);
    const status = normalizeReviewStatus(req.body?.status);

    if (!reviewId || !status) {
      return res.status(400).json({ message: 'Dữ liệu cập nhật không hợp lệ.' });
    }

    const collection = getCollection('danhgia');
    const result = await collection.findOneAndUpdate(
      { dg_ma: reviewId },
      { $set: { dg_trangthai: status, dg_taocapnhat: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    const updatedDoc = result?.value || result;

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Không tìm thấy đánh giá.' });
    }

    await recomputeProductStats(toNumber(updatedDoc.sp_ma, 0));
    const [review] = await mapReviewDocuments([updatedDoc]);
    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.delete('/:reviewId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const reviewId = toNumber(req.params.reviewId, 0);

    if (!reviewId) {
      return res.status(400).json({ message: 'Mã đánh giá không hợp lệ.' });
    }

    const collection = getCollection('danhgia');
    const review = await collection.findOne({ dg_ma: reviewId });

    if (!review) {
      return res.status(404).json({ message: 'Không tìm thấy đánh giá.' });
    }

    await collection.deleteOne({ dg_ma: reviewId });
    await recomputeProductStats(toNumber(review.sp_ma, 0));

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
