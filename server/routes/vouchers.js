const express = require('express');
const User = require('../models/User');
const { isDbConnected } = require('../config/db');
const {
  toNumber,
  normalizeText,
  listAdminVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  updateVoucherStatus,
  assignCustomersToVoucher,
  listCustomerAssignments,
  listVisibleVouchersForUser,
  validateVoucherCode,
} = require('../services/voucherService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json({ publicVouchers: [], privateVouchers: [], all: [] });
    }

    const userId = req.query.userId;
    const scope = normalizeText(req.query.scope || 'all');
    const visible = await listVisibleVouchersForUser(userId);

    if (scope === 'public') {
      return res.json(visible.publicVouchers);
    }

    if (scope === 'mine' || scope === 'private') {
      return res.json(visible.privateVouchers);
    }

    res.json(visible);
  } catch (error) {
    next(error);
  }
});

router.post('/validate', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const result = await validateVoucherCode({
      voucherCode: req.body?.voucherCode,
      userId: req.body?.userId,
      subtotal: req.body?.subtotal,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/customers', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const query = normalizeText(req.query.search || '');
    const users = await User.find({ role: { $regex: /^customer$/i } }).sort({ createdAt: -1 }).lean();

    const mappedUsers = users
      .map((user) => ({
        id: user.id,
        fullName: user.displayName || user.fullName || user.username || user.email || `Khách hàng #${user.id}`,
        email: user.email || '',
        phone: user.phone || '',
      }))
      .filter((user) => {
        if (!query) {
          return true;
        }

        return normalizeText([user.id, user.fullName, user.email, user.phone].join(' ')).includes(query);
      });

    res.json(mappedUsers);
  } catch (error) {
    next(error);
  }
});

router.get('/admin', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const result = await listAdminVouchers({
      search: req.query.search,
      status: req.query.status || 'all',
      type: req.query.type || 'all',
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/admin', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const created = await createVoucher(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    if (error.message) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

router.put('/admin/:voucherId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const updated = await updateVoucher(req.params.voucherId, req.body || {});
    res.json(updated);
  } catch (error) {
    if (error.message) {
      const status = error.message.includes('Không tìm thấy') ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }

    next(error);
  }
});

router.delete('/admin/:voucherId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    await deleteVoucher(req.params.voucherId);
    res.status(204).send();
  } catch (error) {
    if (error.message) {
      const status = error.message.includes('Không tìm thấy') ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }

    next(error);
  }
});

router.patch('/admin/:voucherId/status', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const updated = await updateVoucherStatus(req.params.voucherId, req.body?.status || 'active');
    res.json(updated);
  } catch (error) {
    if (error.message) {
      const status = error.message.includes('Không tìm thấy') ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }

    next(error);
  }
});

router.get('/admin/:voucherId/assignments', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const voucherId = toNumber(req.params.voucherId, 0);
    const assignments = await listCustomerAssignments(voucherId);
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

router.put('/admin/:voucherId/assignments', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const updatedAssignments = await assignCustomersToVoucher(req.params.voucherId, req.body || {});
    res.json(updatedAssignments);
  } catch (error) {
    if (error.message) {
      const status = error.message.includes('Không tìm thấy') ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }

    next(error);
  }
});

module.exports = router;
