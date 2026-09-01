const mongoose = require('mongoose');
const Product = require('../models/Product');
const { products: seedProducts } = require('../data/seedData');
const { isDbConnected } = require('../config/db');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCompletedOrderStatus(value) {
  const status = normalizeText(value);
  return [
    'hoan thanh',
    'hoan tat',
    'da giao',
    'giao thanh cong',
    'completed',
    'done',
  ].some((token) => status.includes(token));
}

function normalizeOrderRecordStatus(order) {
  return order?.status || order?.dh_trangthai || order?.dh_status || '';
}

function getOrderKey(order) {
  return String(order?.orderNumber || order?.id || order?.dh_ma || '').trim();
}

function getReviewStatus(value) {
  const status = String(value || '').trim();
  return status || 'Hiển thị';
}

function isVisibleReviewStatus(value) {
  // normalizeText strips diacritics, so compare against ascii-only flattened tokens.
  const flattened = normalizeText(getReviewStatus(value)).replace(/[^a-z]/g, '');
  if (flattened === 'an') {
    return false;
  }

  return true;
}

function normalizeProducts(products) {
  return products.map((product, index) => {
    const basePrice = parseNumber(product?.price, 0);
    const discount = Math.min(100, Math.max(0, parseNumber(product?.discount, 0)));
    const currentPrice = Math.round(basePrice * (1 - discount / 100));

    return {
      ...product,
      price: basePrice,
      originalPrice: basePrice,
      currentPrice,
      discountedPrice: currentPrice,
      isOnSale: discount > 0 && currentPrice < basePrice,
      rank: product.rank || index + 1,
    };
  });
}

function parseLabels(labels) {
  if (Array.isArray(labels)) {
    return labels.map((label) => String(label).trim()).filter(Boolean);
  }

  if (typeof labels === 'string') {
    return labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
  }

  return [];
}

function parseNumber(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

async function getLiveProductStats() {
  if (!isDbConnected()) {
    return new Map();
  }

  const reviewRows = await mongoose.connection.collection('danhgia')
    .find({})
    .project({ _id: 0, sp_ma: 1, productId: 1, dg_sosao: 1, rating: 1, dg_trangthai: 1, status: 1 })
    .toArray()
    .catch(() => []);

  const reviewStatsByProductId = new Map();
  reviewRows.forEach((review) => {
    if (!isVisibleReviewStatus(review?.dg_trangthai || review?.status)) {
      return;
    }

    const productId = parseNumber(review?.sp_ma || review?.productId, 0);
    if (productId <= 0) {
      return;
    }

    const current = reviewStatsByProductId.get(productId) || { reviewCount: 0, totalStars: 0 };
    current.reviewCount += 1;
    current.totalStars += Math.min(5, Math.max(1, parseNumber(review?.dg_sosao || review?.rating, 0)));
    reviewStatsByProductId.set(productId, current);
  });

  return reviewStatsByProductId;
}

function mergeProductStats(products, reviewStatsByProductId) {
  return products.map((product) => {
    const productId = parseNumber(product?.id, 0);
    const reviewStats = reviewStatsByProductId.get(productId) || { reviewCount: 0, totalStars: 0 };
    const averageRating = reviewStats.reviewCount > 0
      ? Number((reviewStats.totalStars / reviewStats.reviewCount).toFixed(1))
      : parseNumber(product?.rating, 0);

    return {
      ...product,
      rating: averageRating,
      reviews: reviewStats.reviewCount > 0
        ? reviewStats.reviewCount
        : parseNumber(product?.reviews, 0),
    };
  });
}

function toProductDocument(payload, fallbackId) {
  const id = parseNumber(payload.id, fallbackId);
  const explicitSupplierId = parseNumber(payload.ncc_ma ?? payload.supplierId, 0);
  const publisherName = String(payload.publisher || '').trim();
  const defaultSupplierId = 1;
  const supplierId = explicitSupplierId > 0 ? explicitSupplierId : defaultSupplierId;

  return {
    id,
    name: String(payload.name || '').trim(),
    category: String(payload.category || '').trim(),
    players: String(payload.players || '').trim(),
    age: String(payload.age || '').trim(),
    price: parseNumber(payload.price),
    stock: parseNumber(payload.stock),
    rating: parseNumber(payload.rating),
    reviews: parseNumber(payload.reviews),
    image: String(payload.image || '').trim(),
    playTime: String(payload.playTime || '').trim(),
    publisher: publisherName,
    brand: String(payload.brand || '').trim(),
    discount: parseNumber(payload.discount),
    labels: parseLabels(payload.labels),
    description: String(payload.description || '').trim(),
    rank: parseNumber(payload.rank, id),
    ncc_ma: supplierId > 0 ? supplierId : undefined,
    sp_ma: supplierId > 0 ? id : undefined,
  };
}

async function syncSeedProducts() {
  const normalizedProducts = normalizeProducts(seedProducts);

  await Promise.all(
    normalizedProducts.map((product) => (
      Product.updateOne(
        { id: product.id },
        { $set: product },
        { upsert: true }
      )
    ))
  );

  return normalizedProducts;
}

async function ensureProductSeeded() {
  if (!isDbConnected()) {
    return null;
  }

  const count = await Product.countDocuments();
  if (count > 0) {
    return syncSeedProducts();
  }

  return Product.insertMany(normalizeProducts(seedProducts));
}

async function listProducts() {
  if (!isDbConnected()) {
    return normalizeProducts(seedProducts);
  }

  await ensureProductSeeded();
  const [products, reviewStatsByProductId] = await Promise.all([
    Product.find().sort({ createdAt: -1, id: -1 }).lean(),
    getLiveProductStats(),
  ]);

  return normalizeProducts(mergeProductStats(products, reviewStatsByProductId));
}

async function listBestSellerProducts() {
  if (!isDbConnected()) {
    return [];
  }

  await ensureProductSeeded();
  const products = await Product.find().lean();
  const [legacyOrderRows, orderRows, detailRows, reviewRows] = await Promise.all([
    mongoose.connection.collection('donhang')
      .find({})
      .project({ _id: 0, dh_ma: 1, status: 1, dh_trangthai: 1, dh_taomoi: 1 })
      .toArray()
      .catch(() => []),
    mongoose.connection.collection('orders')
      .find({})
      .project({ _id: 0, orderNumber: 1, id: 1, status: 1, items: 1, createdAt: 1, date: 1 })
      .toArray()
      .catch(() => []),
    mongoose.connection.collection('chitietdonhang')
      .find({})
      .project({ _id: 0, dh_ma: 1, sp_ma: 1, ctdh_soluong: 1, ctdh_dongia: 1 })
      .toArray()
      .catch(() => []),
    mongoose.connection.collection('danhgia')
      .find({})
      .project({ _id: 0, sp_ma: 1, dg_sosao: 1, dg_trangthai: 1, status: 1, dh_ma: 1, productId: 1, rating: 1 })
      .toArray()
      .catch(() => []),
  ]);

  const legacyDetailsByOrderKey = new Map();
  detailRows.forEach((detail) => {
    const orderKey = String(detail?.dh_ma || '').trim();
    if (!orderKey) {
      return;
    }

    const items = legacyDetailsByOrderKey.get(orderKey) || [];
    items.push(detail);
    legacyDetailsByOrderKey.set(orderKey, items);
  });

  const soldByProductId = new Map();
  const realOrderKeys = new Set();
  const normalizedOrderRows = [];

  legacyOrderRows.forEach((order) => {
    const orderKey = getOrderKey(order);
    if (!orderKey || !isCompletedOrderStatus(normalizeOrderRecordStatus(order))) {
      return;
    }

    normalizedOrderRows.push({
      orderKey,
      status: normalizeOrderRecordStatus(order),
      items: (legacyDetailsByOrderKey.get(orderKey) || []).map((detail) => ({
        productId: detail?.sp_ma,
        quantity: detail?.ctdh_soluong,
        price: detail?.ctdh_dongia,
      })),
    });
    realOrderKeys.add(orderKey);
  });

  orderRows.forEach((order) => {
    const orderKey = getOrderKey(order);
    if (!orderKey || !isCompletedOrderStatus(normalizeOrderRecordStatus(order))) {
      return;
    }

    if (realOrderKeys.has(orderKey)) {
      return;
    }

    normalizedOrderRows.push({
      orderKey,
      status: normalizeOrderRecordStatus(order),
      items: Array.isArray(order?.items) ? order.items : [],
    });
    realOrderKeys.add(orderKey);
  });

  const uniqueOrderRows = new Map();
  normalizedOrderRows.forEach((order) => {
    if (!uniqueOrderRows.has(order.orderKey)) {
      uniqueOrderRows.set(order.orderKey, order);
    }
  });

  [...uniqueOrderRows.values()].forEach((order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const productId = parseNumber(item?.productId || item?.sp_ma, 0);
      if (productId <= 0) {
        return;
      }

      const quantity = Math.max(0, parseNumber(item?.quantity || item?.ctdh_soluong, 0));
      soldByProductId.set(productId, (soldByProductId.get(productId) || 0) + quantity);
    });
  });

  const reviewStatsByProductId = new Map();
  reviewRows.forEach((review) => {
    if (!isVisibleReviewStatus(review?.dg_trangthai || review?.status)) {
      return;
    }

    const relatedOrderKey = String(review?.dh_ma || '').trim();
    if (relatedOrderKey && !realOrderKeys.has(relatedOrderKey)) {
      return;
    }

    const productId = parseNumber(review?.sp_ma || review?.productId, 0);
    if (productId <= 0) {
      return;
    }

    const current = reviewStatsByProductId.get(productId) || { reviewCount: 0, totalStars: 0 };
    current.reviewCount += 1;
    current.totalStars += Math.min(5, Math.max(1, parseNumber(review?.dg_sosao || review?.rating, 0)));
    reviewStatsByProductId.set(productId, current);
  });

  return [...products]
    .map((product) => {
      const productId = parseNumber(product?.id, 0);
      const reviewStats = reviewStatsByProductId.get(productId) || { reviewCount: 0, totalStars: 0 };
      return {
        ...product,
        soldQuantity: soldByProductId.get(productId) || 0,
        averageRating: reviewStats.reviewCount > 0
          ? Number((reviewStats.totalStars / reviewStats.reviewCount).toFixed(1))
          : 0,
        reviewCount: reviewStats.reviewCount,
        isInStock: parseNumber(product?.stock, 0) > 0,
      };
    })
    .filter((product) => product.soldQuantity > 0 || product.reviewCount > 0)
    .sort((left, right) => (
      (right.soldQuantity - left.soldQuantity)
      || (right.averageRating - left.averageRating)
      || (right.reviewCount - left.reviewCount)
      || (left.id - right.id)
    ))
    .map((product, index) => ({
      ...product,
      rank: index + 1,
    }));
}

async function getProductById(id) {
  const productId = Number(id);

  if (Number.isNaN(productId)) {
    return null;
  }

  if (!isDbConnected()) {
    return normalizeProducts(seedProducts).find((product) => product.id === productId) || null;
  }

  const [product, reviewStatsByProductId] = await Promise.all([
    Product.findOne({ id: productId }).lean(),
    getLiveProductStats(),
  ]);
  if (product) {
    return normalizeProducts(mergeProductStats([product], reviewStatsByProductId))[0] || null;
  }

  await ensureProductSeeded();
  const seededProduct = await Product.findOne({ id: productId }).lean();
  if (!seededProduct) {
    return null;
  }

  return normalizeProducts(mergeProductStats([seededProduct], reviewStatsByProductId))[0] || null;
}

async function createProduct(payload) {
  const nextId = parseNumber(payload.id, NaN) || (await Product.findOne().sort({ id: -1 }).lean())?.id + 1 || 1;
  const document = toProductDocument(payload, nextId);

  if (!document.name || !document.category || !document.players || !document.age || !document.image || !document.description) {
    throw new Error('Thiếu dữ liệu bắt buộc của sản phẩm.');
  }

  if (!isDbConnected()) {
    const products = normalizeProducts(seedProducts);
    products.push(document);
    return document;
  }

  const existing = await Product.findOne({ id: document.id }).lean();
  if (existing) {
    throw new Error('Mã sản phẩm đã tồn tại.');
  }

  const createdProduct = await Product.create(document);
  return createdProduct.toObject();
}

async function updateProduct(id, payload) {
  const productId = parseNumber(id, NaN);
  if (Number.isNaN(productId)) {
    return null;
  }

  const document = toProductDocument({ ...payload, id: productId }, productId);

  if (!document.name || !document.category || !document.players || !document.age || !document.image || !document.description) {
    throw new Error('Thiếu dữ liệu bắt buộc của sản phẩm.');
  }

  if (!isDbConnected()) {
    const localProducts = normalizeProducts(seedProducts);
    const index = localProducts.findIndex((product) => product.id === productId);
    if (index === -1) {
      return null;
    }

    localProducts[index] = { ...localProducts[index], ...document };
    return localProducts[index];
  }

  const updatedProduct = await Product.findOneAndUpdate(
    { id: productId },
    { $set: document },
    { new: true, runValidators: true }
  ).lean();

  return updatedProduct;
}

async function deleteProduct(id) {
  const productId = parseNumber(id, NaN);
  if (Number.isNaN(productId)) {
    return false;
  }

  if (!isDbConnected()) {
    return normalizeProducts(seedProducts).some((product) => product.id === productId);
  }

  const result = await Product.deleteOne({ id: productId });
  return Boolean(result.deletedCount);
}

module.exports = {
  createProduct,
  deleteProduct,
  getProductById,
  listBestSellerProducts,
  listProducts,
  updateProduct,
};
