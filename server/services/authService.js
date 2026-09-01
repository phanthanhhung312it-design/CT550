const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { users: seedUsers } = require('../data/seedData');
const { isDbConnected } = require('../config/db');

const runtimeUsers = seedUsers.map((user) => ({ ...user }));
const systemAccounts = seedUsers
  .filter((user) => user.role === 'admin' || user.role === 'employee')
  .map((user) => ({ ...user }));

function getSeedCustomerUsers() {
  return seedUsers.filter((user) => user.role === 'customer');
}

function normalizeIdentifier(identifier) {
  return identifier.trim().toLowerCase();
}

function normalizePhone(phone) {
  return phone.trim();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    username: user.username,
    phone: user.phone,
    role: user.role,
    isLocked: Boolean(user.isLocked),
    avatar: user.avatar,
  };
}

function getRuntimeUsers() {
  return runtimeUsers;
}

async function getNextUserId() {
  if (!isDbConnected()) {
    return getRuntimeUsers().reduce((maxId, user) => Math.max(maxId, Number(user.id) || 0), 0) + 1;
  }

  const latestUser = await User.findOne().sort({ id: -1 }).lean();
  return (latestUser?.id || 0) + 1;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^0\d{9}$/.test(phone);
}

function getDuplicateUserIdentifier(email, username, phone) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeIdentifier(username);
  const normalizedPhone = normalizePhone(phone);

  return getRuntimeUsers().find((user) => (
    user.email === normalizedEmail || user.username === normalizedUsername || user.phone === normalizedPhone
  )) || null;
}

async function ensureUsersSeeded() {
  if (!isDbConnected()) {
    return null;
  }

  await User.deleteMany({ role: { $ne: 'customer' } });

  await Promise.all(
    getSeedCustomerUsers().map((user) => User.updateOne(
      { id: user.id },
      { $set: user },
      { upsert: true }
    ))
  );

  return getSeedCustomerUsers();
}

async function findUserByIdentifier(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!isDbConnected()) {
    return getRuntimeUsers().find((user) => (
      user.email.toLowerCase() === normalizedIdentifier || user.username.toLowerCase() === normalizedIdentifier
    )) || null;
  }

  await ensureUsersSeeded();
  const customerUser = await User.findOne({
    $or: [
      { email: normalizedIdentifier },
      { username: normalizedIdentifier },
    ],
  }).lean();

  if (customerUser) {
    return customerUser;
  }

  return systemAccounts.find((user) => (
    user.email.toLowerCase() === normalizedIdentifier || user.username.toLowerCase() === normalizedIdentifier
  )) || null;
}

async function registerUser(payload) {
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';

  if (!email || !username || !phone || !password || !confirmPassword) {
    return { user: null, message: 'Vui lòng nhập đầy đủ thông tin đăng ký.' };
  }

  if (!isValidEmail(email)) {
    return { user: null, message: 'Email không đúng định dạng.' };
  }

  if (!isValidPhone(phone)) {
    return { user: null, message: 'Số điện thoại không hợp lệ.' };
  }

  if (password.length < 8) {
    return { user: null, message: 'Mật khẩu phải có ít nhất 8 ký tự.' };
  }

  if (password !== confirmPassword) {
    return { user: null, message: 'Mật khẩu và xác nhận mật khẩu không khớp.' };
  }

  if (isDbConnected()) {
    await ensureUsersSeeded();
    const existingUser = await User.findOne({
      $or: [
        { email: normalizeEmail(email) },
        { username: normalizeIdentifier(username) },
        { phone: normalizePhone(phone) },
      ],
    }).lean();

    if (existingUser) {
      if (existingUser.email === normalizeEmail(email)) {
        return { user: null, message: 'Email đã được sử dụng.' };
      }

      if (existingUser.username === normalizeIdentifier(username)) {
        return { user: null, message: 'Tên tài khoản đã tồn tại.' };
      }

      return { user: null, message: 'Số điện thoại đã được sử dụng.' };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdUser = await User.create({
      id: await getNextUserId(),
      displayName: username,
      email: normalizeEmail(email),
      username: normalizeIdentifier(username),
      phone: normalizePhone(phone),
      password: passwordHash,
      passwordHash,
      role: 'customer',
      isLocked: false,
      avatar: username.slice(0, 1).toUpperCase(),
    });

    const token = jwt.sign(
      {
        sub: String(createdUser.id),
        role: createdUser.role,
        email: createdUser.email,
      },
      process.env.JWT_SECRET || 'boardgamevn-secret-key',
      { expiresIn: '7d' }
    );

    return {
      user: normalizeUser(createdUser.toObject()),
      token,
    };
  }

  const duplicateUser = getDuplicateUserIdentifier(email, username, phone);
  if (duplicateUser) {
    if (duplicateUser.email === normalizeEmail(email)) {
      return { user: null, message: 'Email đã được sử dụng.' };
    }

    if (duplicateUser.username === normalizeIdentifier(username)) {
      return { user: null, message: 'Tên tài khoản đã tồn tại.' };
    }

    return { user: null, message: 'Số điện thoại đã được sử dụng.' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: await getNextUserId(),
    displayName: username,
    email: normalizeEmail(email),
    username: normalizeIdentifier(username),
    phone: normalizePhone(phone),
    password: passwordHash,
    passwordHash,
    role: 'customer',
    isLocked: false,
    avatar: username.slice(0, 1).toUpperCase(),
  };

  getRuntimeUsers().push(user);

  const token = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET || 'boardgamevn-secret-key',
    { expiresIn: '7d' }
  );

  return {
    user: normalizeUser(user),
    token,
  };
}

async function loginUser(identifier, password) {
  const user = await findUserByIdentifier(identifier);

  if (!user) {
    return { user: null, message: 'Tài khoản hoặc mật khẩu không đúng.' };
  }

  if (user.isLocked) {
    return { user: null, message: 'Tài khoản của bạn đang bị khóa.' };
  }

  const storedPassword = user.password || user.passwordHash || '';
  const isPasswordValid = await bcrypt.compare(password, storedPassword);

  if (!isPasswordValid) {
    return { user: null, message: 'Tài khoản hoặc mật khẩu không đúng.' };
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET || 'boardgamevn-secret-key',
    { expiresIn: '7d' }
  );

  return {
    user: normalizeUser(user),
    token,
  };
}

module.exports = {
  loginUser,
  registerUser,
};