const express = require('express');
const { loginUser, registerUser } = require('../services/authService');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    const trimmedPassword = typeof password === 'string' ? password.trim() : '';

    if (!trimmedIdentifier || !trimmedPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập email/tên đăng nhập và mật khẩu.' });
    }

    const result = await loginUser(trimmedIdentifier, trimmedPassword);

    if (!result.user) {
      return res.status(401).json({ message: result.message });
    }

    res.json({
      message: 'Đăng nhập thành công.',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const result = await registerUser(req.body || {});

    if (!result.user) {
      return res.status(400).json({ message: result.message });
    }

    res.status(201).json({
      message: 'Đăng ký thành công.',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;