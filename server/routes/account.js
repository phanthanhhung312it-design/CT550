const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { isDbConnected } = require('../config/db');

const router = express.Router();

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildUserIdFilter(userId) {
  const numericUserId = toNumber(userId, 0);
  return {
    $or: [
      { user_ma: numericUserId },
      { user_ma: String(numericUserId) },
      { userId: numericUserId },
      { userId: String(numericUserId) },
    ],
  };
}

function buildProductIdFilter(productId) {
  const numericProductId = toNumber(productId, 0);
  return {
    $or: [
      { sp_ma: numericProductId },
      { sp_ma: String(numericProductId) },
      { productId: numericProductId },
      { productId: String(numericProductId) },
    ],
  };
}

function buildUserProductFilter(userId, productId) {
  return {
    $and: [
      buildUserIdFilter(userId),
      buildProductIdFilter(productId),
    ],
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').trim();
}

function normalizeName(name) {
  return String(name || '').trim();
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return header.slice(7).trim();
}

function parseAuth(req) {
  const token = readBearerToken(req);
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'boardgamevn-secret-key');
  } catch {
    return null;
  }
}

function requireAuth(req, res) {
  const payload = parseAuth(req);
  if (!payload?.sub) {
    res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return null;
  }

  return payload;
}

function mapProfile(user, defaultAddress) {
  return {
    id: user.id,
    fullName: user.displayName || user.fullName || user.username || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone || '',
    avatar: user.avatar || '',
    role: user.role || 'customer',
    defaultAddress: defaultAddress
      ? {
        id: defaultAddress.dc_ma,
        recipientName: defaultAddress.dc_hoten || '',
        phone: defaultAddress.dc_dienthoai || '',
        addressLine: defaultAddress.dc_diachi || '',
      }
      : null,
  };
}

function mapAddress(item = {}) {
  return {
    id: item.dc_ma || item.id,
    recipientName: item.dc_hoten || item.fullName || 'Khách hàng',
    phone: item.dc_dienthoai || item.phone || '',
    addressLine: item.dc_diachi || item.address || '',
    isDefault: Boolean(item.dc_macdinh),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

function mapFavorite(item = {}, product = null) {
  return {
    id: item.id,
    productId: toNumber(item.sp_ma || item.productId, 0),
    createdAt: item.created_at || item.createdAt || null,
    product,
  };
}

function mapCartItem(item = {}, product = null) {
  return {
    id: item.id,
    productId: toNumber(item.sp_ma || item.productId, 0),
    quantity: Math.max(1, toNumber(item.quantity || item.soluong, 1)),
    createdAt: item.created_at || item.createdAt || null,
    updatedAt: item.updatedAt || item.updated_at || null,
    product,
  };
}

async function getNextAddressId() {
  const [lastAddress] = await getCollection('diachigiaohang')
    .find({}, { projection: { dc_ma: 1 } })
    .sort({ dc_ma: -1 })
    .limit(1)
    .toArray();

  return toNumber(lastAddress?.dc_ma, 0) + 1;
}

async function getNextCollectionId(collectionName, fieldName = 'id') {
  const [lastRow] = await getCollection(collectionName)
    .find({}, { projection: { [fieldName]: 1 } })
    .sort({ [fieldName]: -1 })
    .limit(1)
    .toArray();

  return toNumber(lastRow?.[fieldName], 0) + 1;
}

async function getProductsByIds(productIds = []) {
  const uniqueIds = [...new Set(productIds.map((item) => toNumber(item, 0)).filter((item) => item > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = await getCollection('products')
    .find({ id: { $in: uniqueIds } })
    .project({ _id: 0 })
    .toArray()
    .catch(() => []);

  return new Map(rows.map((item) => [toNumber(item.id, 0), item]));
}

router.get('/profile', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const user = await User.findOne({ id: userId }).lean();

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const defaultAddress = await getCollection('diachigiaohang')
      .find({ ...buildUserIdFilter(userId), dc_macdinh: true })
      .project({ _id: 0 })
      .limit(1)
      .toArray()
      .then((rows) => rows[0] || null)
      .catch(() => null);

    return res.json(mapProfile(user, defaultAddress));
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const payload = req.body || {};
    const fullName = normalizeName(payload.fullName);
    const email = normalizeEmail(payload.email);
    const phone = normalizePhone(payload.phone);
    const avatar = String(payload.avatar || '').trim();

    const currentUser = await User.findOne({ id: userId }).lean();

    if (!currentUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    if (!fullName || !email || !phone) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và số điện thoại.' });
    }

    const duplicate = await User.findOne({
      id: { $ne: userId },
      $or: [
        { email },
        { phone },
      ],
    }).lean();

    if (duplicate) {
      if (duplicate.email === email) {
        return res.status(409).json({ message: 'Email đã được sử dụng.' });
      }

      if (duplicate.phone === phone) {
        return res.status(409).json({ message: 'Số điện thoại đã được sử dụng.' });
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { id: userId },
      {
        $set: {
          displayName: fullName,
          email,
          phone,
          avatar: avatar || currentUser.avatar || fullName.slice(0, 1).toUpperCase(),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const defaultAddress = await getCollection('diachigiaohang')
      .find({ ...buildUserIdFilter(userId), dc_macdinh: true })
      .project({ _id: 0 })
      .limit(1)
      .toArray()
      .then((rows) => rows[0] || null)
      .catch(() => null);

    return res.json(mapProfile(updatedUser, defaultAddress));
  } catch (error) {
    return next(error);
  }
});

router.put('/password', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const payload = req.body || {};
    const currentPassword = String(payload.currentPassword || '');
    const newPassword = String(payload.newPassword || '');
    const confirmPassword = String(payload.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin đổi mật khẩu.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Mật khẩu xác nhận không khớp.' });
    }

    const user = await User.findOne({ id: userId }).lean();
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const currentHash = user.passwordHash || user.password;
    const matched = await bcrypt.compare(currentPassword, currentHash || '');
    if (!matched) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng.' });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { id: userId },
      {
        $set: {
          password: nextHash,
          passwordHash: nextHash,
        },
      }
    );

    return res.json({ message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/addresses', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const rows = await getCollection('diachigiaohang')
      .find(buildUserIdFilter(userId))
      .project({ _id: 0 })
      .sort({ dc_macdinh: -1, dc_ma: -1 })
      .toArray();

    return res.json(rows.map(mapAddress));
  } catch (error) {
    return next(error);
  }
});

router.post('/addresses', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const payload = req.body || {};
    const recipientName = normalizeName(payload.recipientName);
    const phone = normalizePhone(payload.phone);
    const addressLine = String(payload.addressLine || '').trim();
    const isDefault = Boolean(payload.isDefault);

    if (!recipientName || !phone || !addressLine) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ người nhận, số điện thoại và địa chỉ.' });
    }

    if (isDefault) {
      await getCollection('diachigiaohang').updateMany(buildUserIdFilter(userId), { $set: { dc_macdinh: false } });
    }

    const id = await getNextAddressId();
    const document = {
      dc_ma: id,
      user_ma: userId,
      dc_hoten: recipientName,
      dc_dienthoai: phone,
      dc_diachi: addressLine,
      dc_macdinh: isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await getCollection('diachigiaohang').insertOne(document);
    return res.status(201).json(mapAddress(document));
  } catch (error) {
    return next(error);
  }
});

router.put('/addresses/:addressId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const addressId = toNumber(req.params.addressId, 0);
    if (!addressId) {
      return res.status(400).json({ message: 'Mã địa chỉ không hợp lệ.' });
    }

    const payload = req.body || {};
    const recipientName = normalizeName(payload.recipientName);
    const phone = normalizePhone(payload.phone);
    const addressLine = String(payload.addressLine || '').trim();
    const isDefault = Boolean(payload.isDefault);

    if (!recipientName || !phone || !addressLine) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ người nhận, số điện thoại và địa chỉ.' });
    }

    const existingAddress = await getCollection('diachigiaohang').findOne({ dc_ma: addressId, ...buildUserIdFilter(userId) });
    if (!existingAddress) {
      return res.status(404).json({ message: 'Không tìm thấy địa chỉ cần cập nhật.' });
    }

    if (isDefault) {
      await getCollection('diachigiaohang').updateMany(buildUserIdFilter(userId), { $set: { dc_macdinh: false } });
    }

    await getCollection('diachigiaohang').updateOne(
      { dc_ma: addressId, ...buildUserIdFilter(userId) },
      {
        $set: {
          dc_hoten: recipientName,
          dc_dienthoai: phone,
          dc_diachi: addressLine,
          dc_macdinh: isDefault,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const updated = await getCollection('diachigiaohang').findOne({ dc_ma: addressId, ...buildUserIdFilter(userId) }, { projection: { _id: 0 } });
    return res.json(mapAddress(updated));
  } catch (error) {
    return next(error);
  }
});

router.patch('/addresses/:addressId/default', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const addressId = toNumber(req.params.addressId, 0);
    if (!addressId) {
      return res.status(400).json({ message: 'Mã địa chỉ không hợp lệ.' });
    }

    const existingAddress = await getCollection('diachigiaohang').findOne({ dc_ma: addressId, ...buildUserIdFilter(userId) });
    if (!existingAddress) {
      return res.status(404).json({ message: 'Không tìm thấy địa chỉ.' });
    }

    await getCollection('diachigiaohang').updateMany(buildUserIdFilter(userId), { $set: { dc_macdinh: false } });
    await getCollection('diachigiaohang').updateOne(
      { dc_ma: addressId, ...buildUserIdFilter(userId) },
      { $set: { dc_macdinh: true, updatedAt: new Date().toISOString() } }
    );

    const updated = await getCollection('diachigiaohang').findOne({ dc_ma: addressId, ...buildUserIdFilter(userId) }, { projection: { _id: 0 } });
    return res.json(mapAddress(updated));
  } catch (error) {
    return next(error);
  }
});

router.delete('/addresses/:addressId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const addressId = toNumber(req.params.addressId, 0);
    if (!addressId) {
      return res.status(400).json({ message: 'Mã địa chỉ không hợp lệ.' });
    }

    const existingAddress = await getCollection('diachigiaohang').findOne({ dc_ma: addressId, ...buildUserIdFilter(userId) });
    if (!existingAddress) {
      return res.status(404).json({ message: 'Không tìm thấy địa chỉ.' });
    }

    await getCollection('diachigiaohang').deleteOne({ dc_ma: addressId, ...buildUserIdFilter(userId) });

    if (existingAddress.dc_macdinh) {
      const nextAddress = await getCollection('diachigiaohang').find(buildUserIdFilter(userId)).sort({ dc_ma: -1 }).limit(1).toArray();
      if (nextAddress[0]) {
        await getCollection('diachigiaohang').updateOne(
          { dc_ma: nextAddress[0].dc_ma, ...buildUserIdFilter(userId) },
          { $set: { dc_macdinh: true, updatedAt: new Date().toISOString() } }
        );
      }
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get('/favorites', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const rows = await getCollection('yeuthich')
      .find(buildUserIdFilter(userId))
      .project({ _id: 0 })
      .sort({ id: -1 })
      .toArray();

    const productMap = await getProductsByIds(rows.map((item) => item.sp_ma || item.productId));
    return res.json(rows.map((item) => mapFavorite(item, productMap.get(toNumber(item.sp_ma || item.productId, 0)) || null)));
  } catch (error) {
    return next(error);
  }
});

router.post('/favorites', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const productId = toNumber(req.body?.productId, 0);
    if (!productId) {
      return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ.' });
    }

    const product = await getCollection('products').findOne({ id: productId }, { projection: { _id: 0 } });
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }

    const collection = getCollection('yeuthich');
    const existing = await collection.findOne({
      ...buildUserProductFilter(userId, productId),
    });

    if (existing) {
      return res.json(mapFavorite(existing, product));
    }

    const favorite = {
      id: await getNextCollectionId('yeuthich'),
      user_ma: userId,
      sp_ma: productId,
      created_at: new Date().toISOString(),
    };

    await collection.insertOne(favorite);
    return res.status(201).json(mapFavorite(favorite, product));
  } catch (error) {
    return next(error);
  }
});

router.delete('/favorites/:productId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const productId = toNumber(req.params.productId, 0);
    if (!productId) {
      return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ.' });
    }

    const result = await getCollection('yeuthich').deleteOne({
      ...buildUserProductFilter(userId, productId),
    });

    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Sản phẩm chưa có trong danh sách yêu thích.' });
    }

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/cart', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const rows = await getCollection('giohang')
      .find(buildUserIdFilter(userId))
      .project({ _id: 0 })
      .sort({ updatedAt: -1, id: -1 })
      .toArray();

    const productMap = await getProductsByIds(rows.map((item) => item.sp_ma || item.productId));
    return res.json(rows.map((item) => mapCartItem(item, productMap.get(toNumber(item.sp_ma || item.productId, 0)) || null)));
  } catch (error) {
    return next(error);
  }
});

router.post('/cart/items', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const productId = toNumber(req.body?.productId, 0);
    const quantity = Math.max(1, toNumber(req.body?.quantity, 1));

    if (!productId) {
      return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ.' });
    }

    const product = await getCollection('products').findOne({ id: productId }, { projection: { _id: 0 } });
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }

    const stock = Math.max(0, toNumber(product.stock, 0));
    const collection = getCollection('giohang');
    const existing = await collection.findOne({
      ...buildUserProductFilter(userId, productId),
    });

    if (existing) {
      const nextQuantity = Math.min(stock || Number.MAX_SAFE_INTEGER, Math.max(1, toNumber(existing.quantity, 1) + quantity));
      const result = await collection.findOneAndUpdate(
        { id: existing.id },
        { $set: { quantity: nextQuantity, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' }
      );
      const updated = result?.value || result;
      return res.json(mapCartItem(updated, product));
    }

    const cartItem = {
      id: await getNextCollectionId('giohang'),
      user_ma: userId,
      sp_ma: productId,
      quantity: Math.min(stock || Number.MAX_SAFE_INTEGER, quantity),
      created_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await collection.insertOne(cartItem);
    return res.status(201).json(mapCartItem(cartItem, product));
  } catch (error) {
    return next(error);
  }
});

router.put('/cart/items/:productId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const productId = toNumber(req.params.productId, 0);
    const quantity = toNumber(req.body?.quantity, 0);

    if (!productId) {
      return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ.' });
    }

    if (quantity <= 0) {
      await getCollection('giohang').deleteOne({
        ...buildUserProductFilter(userId, productId),
      });
      return res.status(204).end();
    }

    const product = await getCollection('products').findOne({ id: productId }, { projection: { _id: 0 } });
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }

    const nextQuantity = Math.min(Math.max(0, toNumber(product.stock, 0)) || Number.MAX_SAFE_INTEGER, Math.max(1, quantity));
    const result = await getCollection('giohang').findOneAndUpdate(
      {
        ...buildUserProductFilter(userId, productId),
      },
      {
        $set: {
          quantity: nextQuantity,
          updatedAt: new Date().toISOString(),
        },
      },
      { returnDocument: 'after' }
    );

    const updated = result?.value || result;
    if (!updated) {
      return res.status(404).json({ message: 'Sản phẩm chưa có trong giỏ hàng.' });
    }

    return res.json(mapCartItem(updated, product));
  } catch (error) {
    return next(error);
  }
});

router.delete('/cart/items/:productId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    const productId = toNumber(req.params.productId, 0);
    if (!productId) {
      return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ.' });
    }

    await getCollection('giohang').deleteOne({
      ...buildUserProductFilter(userId, productId),
    });

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.delete('/cart', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const authPayload = requireAuth(req, res);
    if (!authPayload) {
      return undefined;
    }

    const userId = toNumber(authPayload.sub, 0);
    await getCollection('giohang').deleteMany(buildUserIdFilter(userId));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
