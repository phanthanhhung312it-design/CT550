const mongoose = require('mongoose');

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

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(value) {
  const date = parseDateValue(value);
  return date ? date.toISOString() : null;
}

function getVoucherScope(rawVoucher = {}) {
  const explicitScope = normalizeText(rawVoucher.scope || rawVoucher.vc_scope || rawVoucher.vc_loai || rawVoucher.typeScope);
  if (explicitScope.includes('private') || explicitScope.includes('rieng')) {
    return 'private';
  }

  if (explicitScope.includes('public') || explicitScope.includes('cong khai')) {
    return 'public';
  }

  const privateFlag = rawVoucher.vc_riengtu || rawVoucher.isPrivate;
  if (privateFlag === true || privateFlag === 1 || privateFlag === '1') {
    return 'private';
  }

  return 'public';
}

function getVoucherStatus(rawVoucher = {}, now = new Date()) {
  const explicit = normalizeText(rawVoucher.status || rawVoucher.vc_trangthai);
  if (['locked', 'khoa', 'da khoa', 'inactive', 'disabled'].some((item) => explicit.includes(item))) {
    return 'locked';
  }

  const startDate = parseDateValue(rawVoucher.vc_ngaybatdau || rawVoucher.startDate);
  const endDate = parseDateValue(rawVoucher.vc_ngayketthuc || rawVoucher.endDate);
  const quantity = toNumber(rawVoucher.vc_soluong ?? rawVoucher.quantity, 0);
  const usedCount = toNumber(rawVoucher.vc_dasudung ?? rawVoucher.usedCount, 0);

  if (startDate && now < startDate) {
    return 'scheduled';
  }

  if (endDate && now > endDate) {
    return 'expired';
  }

  if (quantity > 0 && usedCount >= quantity) {
    return 'out_of_stock';
  }

  return 'active';
}

function toVoucherView(rawVoucher = {}, assignment = null) {
  const startDate = toIsoDate(rawVoucher.vc_ngaybatdau || rawVoucher.startDate);
  const endDate = toIsoDate(rawVoucher.vc_ngayketthuc || rawVoucher.endDate);
  const quantity = Math.max(0, toNumber(rawVoucher.vc_soluong ?? rawVoucher.quantity, 0));
  const usedCount = Math.max(0, toNumber(rawVoucher.vc_dasudung ?? rawVoucher.usedCount, 0));
  const maxUsesPerCustomer = Math.max(0, toNumber(rawVoucher.vc_solan_sudung_toi_da ?? rawVoucher.maxUsesPerCustomer, 1)) || 1;
  const status = getVoucherStatus(rawVoucher);
  const scope = getVoucherScope(rawVoucher);

  const assignmentUsedCount = Math.max(0, toNumber(assignment?.usedCount ?? assignment?.da_su_dung, 0));
  const assignmentMaxUses = Math.max(0, toNumber(assignment?.maxUses, maxUsesPerCustomer)) || maxUsesPerCustomer;

  return {
    id: rawVoucher.vc_ma || rawVoucher.id || String(rawVoucher._id || ''),
    code: String(rawVoucher.vc_code || rawVoucher.code || '').trim(),
    title: String(rawVoucher.vc_ten || rawVoucher.title || rawVoucher.vc_code || 'Voucher').trim(),
    description: String(rawVoucher.vc_mota || rawVoucher.description || '').trim(),
    scope,
    discountType: toNumber(rawVoucher.vc_loaigiamgia || rawVoucher.type || 2, 2),
    value: Math.max(0, toNumber(rawVoucher.vc_giatri || rawVoucher.value, 0)),
    maxDiscount: Math.max(0, toNumber(rawVoucher.vc_giamtoida || rawVoucher.maxDiscount, 0)),
    minAmount: Math.max(0, toNumber(rawVoucher.vc_dieukien_toithieu || rawVoucher.minAmount, 0)),
    startDate,
    endDate,
    quantity,
    usedCount,
    remainingQuantity: quantity > 0 ? Math.max(0, quantity - usedCount) : null,
    maxUsesPerCustomer,
    status,
    isActive: status === 'active',
    assignment: assignment
      ? {
        userId: toNumber(assignment.userId || assignment.user_ma, 0),
        maxUses: assignmentMaxUses,
        usedCount: assignmentUsedCount,
        remainingUses: Math.max(0, assignmentMaxUses - assignmentUsedCount),
        status: normalizeText(assignment.status || assignment.trangthai || 'active').includes('lock') ? 'locked' : 'active',
      }
      : null,
    createdAt: rawVoucher.createdAt || rawVoucher.vc_taomoi || null,
    updatedAt: rawVoucher.updatedAt || rawVoucher.vc_capnhat || null,
  };
}

function calculateDiscount(subtotal, voucher) {
  if (!voucher || subtotal <= 0) {
    return 0;
  }

  const discountType = toNumber(voucher.discountType || voucher.vc_loaigiamgia, 2);
  const value = Math.max(0, toNumber(voucher.value || voucher.vc_giatri, 0));
  const maxDiscount = Math.max(0, toNumber(voucher.maxDiscount || voucher.vc_giamtoida, 0));

  if (discountType === 1) {
    const base = Math.round((subtotal * value) / 100);
    return maxDiscount > 0 ? Math.min(base, maxDiscount) : base;
  }

  return Math.min(value, subtotal);
}

function buildVoucherFilterById(voucherId) {
  const candidate = [voucherId];
  if (!Number.isNaN(Number(voucherId))) {
    candidate.push(Number(voucherId));
  }

  if (mongoose.isValidObjectId(voucherId)) {
    candidate.push(new mongoose.Types.ObjectId(voucherId));
  }

  const stringCandidates = candidate
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    $or: [
      { vc_ma: { $in: candidate } },
      { id: { $in: candidate } },
      { vc_code: { $in: stringCandidates } },
      { code: { $in: stringCandidates } },
      { _id: { $in: candidate.filter((item) => item instanceof mongoose.Types.ObjectId) } },
    ],
  };
}

async function getNextNumericId(collectionName, fieldName) {
  const [lastItem] = await getCollection(collectionName)
    .find({}, { projection: { [fieldName]: 1 } })
    .sort({ [fieldName]: -1 })
    .limit(1)
    .toArray();

  return toNumber(lastItem?.[fieldName], 0) + 1;
}

async function listCustomerAssignments(voucherId) {
  const numericVoucherId = toNumber(voucherId, 0);
  if (!numericVoucherId) {
    return [];
  }

  return getCollection('voucher_khachhang')
    .find({ vc_ma: numericVoucherId })
    .toArray()
    .catch(() => []);
}

function normalizeAssignmentRecord(item = {}) {
  return {
    id: item.id || String(item._id || ''),
    voucherId: toNumber(item.vc_ma || item.voucherId, 0),
    userId: toNumber(item.user_ma || item.userId, 0),
    maxUses: Math.max(1, toNumber(item.maxUses || item.max_uses || 1, 1)),
    usedCount: Math.max(0, toNumber(item.usedCount ?? item.da_su_dung, 0)),
    status: normalizeText(item.status || item.trangthai || 'active').includes('lock') ? 'locked' : 'active',
    assignedAt: item.assignedAt || item.createdAt || item.ngay_cap || null,
    updatedAt: item.updatedAt || null,
  };
}

async function listAdminVouchers(options = {}) {
  const { search = '', status = 'all', type = 'all' } = options;
  const vouchers = await getCollection('voucher').find({}).sort({ vc_ma: -1 }).toArray();
  const assignments = await getCollection('voucher_khachhang').find({}).toArray().catch(() => []);

  const assignmentsByVoucher = assignments.reduce((map, item) => {
    const voucherId = toNumber(item.vc_ma || item.voucherId, 0);
    if (!map.has(voucherId)) {
      map.set(voucherId, []);
    }

    map.get(voucherId).push(normalizeAssignmentRecord(item));
    return map;
  }, new Map());

  const query = normalizeText(search);

  return vouchers
    .map((voucher) => {
      const voucherId = toNumber(voucher.vc_ma || voucher.id, 0);
      const mappedVoucher = toVoucherView(voucher);
      const linkedAssignments = assignmentsByVoucher.get(voucherId) || [];
      return {
        ...mappedVoucher,
        assignedCustomerCount: linkedAssignments.length,
        assignedCustomers: linkedAssignments,
      };
    })
    .filter((voucher) => {
      const matchSearch = !query || normalizeText([voucher.code, voucher.title, voucher.description].join(' ')).includes(query);
      const matchStatus = status === 'all' || voucher.status === status;
      const matchType = type === 'all' || voucher.scope === type;
      return matchSearch && matchStatus && matchType;
    });
}

function normalizeVoucherPayload(payload = {}, previous = null) {
  const nowIso = new Date().toISOString();
  const code = String(payload.code || payload.vc_code || previous?.vc_code || '').trim().toUpperCase();
  const title = String(payload.title || payload.vc_ten || previous?.vc_ten || code || 'Voucher').trim();
  const scope = normalizeText(payload.scope || payload.vc_scope || previous?.vc_scope || 'public').includes('private') ? 'private' : 'public';
  const status = String(payload.status || payload.vc_trangthai || previous?.vc_trangthai || 'active').trim();

  return {
    vc_code: code,
    vc_ten: title,
    vc_mota: String(payload.description || payload.vc_mota || previous?.vc_mota || '').trim(),
    vc_scope: scope,
    vc_loaigiamgia: toNumber(payload.discountType || payload.vc_loaigiamgia || previous?.vc_loaigiamgia || 2, 2) === 1 ? 1 : 2,
    vc_giatri: Math.max(0, toNumber(payload.value || payload.vc_giatri || previous?.vc_giatri, 0)),
    vc_giamtoida: Math.max(0, toNumber(payload.maxDiscount || payload.vc_giamtoida || previous?.vc_giamtoida, 0)),
    vc_dieukien_toithieu: Math.max(0, toNumber(payload.minAmount || payload.vc_dieukien_toithieu || previous?.vc_dieukien_toithieu, 0)),
    vc_soluong: Math.max(0, toNumber(payload.quantity || payload.vc_soluong || previous?.vc_soluong, 0)),
    vc_dasudung: Math.max(0, toNumber(previous?.vc_dasudung || payload.usedCount || payload.vc_dasudung, 0)),
    vc_solan_sudung_toi_da: Math.max(1, toNumber(payload.maxUsesPerCustomer || payload.vc_solan_sudung_toi_da || previous?.vc_solan_sudung_toi_da, 1)),
    vc_ngaybatdau: toIsoDate(payload.startDate || payload.vc_ngaybatdau || previous?.vc_ngaybatdau || null),
    vc_ngayketthuc: toIsoDate(payload.endDate || payload.vc_ngayketthuc || previous?.vc_ngayketthuc || null),
    vc_trangthai: status,
    updatedAt: nowIso,
  };
}

async function createVoucher(payload = {}) {
  const voucherCollection = getCollection('voucher');
  const code = String(payload.code || '').trim().toUpperCase();

  if (!code) {
    throw new Error('Mã voucher không được để trống.');
  }

  const existed = await voucherCollection.findOne({ vc_code: code });
  if (existed) {
    throw new Error('Mã voucher đã tồn tại.');
  }

  const nextVoucherId = await getNextNumericId('voucher', 'vc_ma');
  const document = {
    vc_ma: nextVoucherId,
    ...normalizeVoucherPayload(payload),
    vc_taomoi: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await voucherCollection.insertOne(document);
  return toVoucherView(document);
}

async function findVoucherDocument(voucherId) {
  const voucherCollection = getCollection('voucher');
  const filter = buildVoucherFilterById(voucherId);
  return voucherCollection.findOne(filter);
}

async function updateVoucher(voucherId, payload = {}) {
  const voucherCollection = getCollection('voucher');
  let existed = await findVoucherDocument(voucherId);

  if (!existed) {
    const fallbackCode = String(payload.code || payload.vc_code || '').trim().toUpperCase();
    if (fallbackCode) {
      existed = await voucherCollection.findOne({ vc_code: fallbackCode });
    }
  }

  if (!existed) {
    // Legacy admin rows may come from fallback sources (promotions/rental options)
    // and have synthetic ids. In this case, upsert by creating a canonical voucher.
    return createVoucher(payload);
  }

  const updatePayload = normalizeVoucherPayload(payload, existed);
  await voucherCollection.updateOne({ _id: existed._id }, { $set: updatePayload });

  const updated = await voucherCollection.findOne({ _id: existed._id });
  return toVoucherView(updated);
}

async function deleteVoucher(voucherId) {
  const voucherCollection = getCollection('voucher');
  const existed = await findVoucherDocument(voucherId);

  if (!existed) {
    throw new Error('Không tìm thấy voucher cần xóa.');
  }

  await voucherCollection.deleteOne({ _id: existed._id });
  await getCollection('voucher_khachhang').deleteMany({ vc_ma: toNumber(existed.vc_ma || existed.id, -1) });

  return true;
}

async function updateVoucherStatus(voucherId, status) {
  const voucherCollection = getCollection('voucher');
  const existed = await findVoucherDocument(voucherId);

  if (!existed) {
    throw new Error('Không tìm thấy voucher cần cập nhật trạng thái.');
  }

  await voucherCollection.updateOne(
    { _id: existed._id },
    { $set: { vc_trangthai: String(status || 'active'), updatedAt: new Date().toISOString() } }
  );

  const updated = await voucherCollection.findOne({ _id: existed._id });
  return toVoucherView(updated);
}

async function assignCustomersToVoucher(voucherId, payload = {}) {
  const voucher = await findVoucherDocument(voucherId);
  if (!voucher) {
    throw new Error('Không tìm thấy voucher để cấp cho khách hàng.');
  }

  const numericVoucherId = toNumber(voucher.vc_ma || voucher.id, 0);
  if (!numericVoucherId) {
    throw new Error('Voucher không có mã hợp lệ.');
  }

  const customerIds = Array.isArray(payload.customerIds)
    ? payload.customerIds.map((item) => toNumber(item, 0)).filter((item) => item > 0)
    : [];
  const maxCustomers = Math.max(0, toNumber(payload.maxCustomers, 0));
  const maxUses = Math.max(1, toNumber(payload.maxUsesPerCustomer || voucher.vc_solan_sudung_toi_da, 1));

  const uniqueCustomerIds = [...new Set(customerIds)];
  const pickedCustomerIds = maxCustomers > 0 ? uniqueCustomerIds.slice(0, maxCustomers) : uniqueCustomerIds;

  const assignmentCollection = getCollection('voucher_khachhang');
  const currentAssignments = await assignmentCollection.find({ vc_ma: numericVoucherId }).toArray();
  const currentMap = new Map(currentAssignments.map((item) => [toNumber(item.user_ma || item.userId, 0), item]));
  const nextIds = await getNextNumericId('voucher_khachhang', 'id');
  let runningId = nextIds;

  for (const assignment of currentAssignments) {
    const userId = toNumber(assignment.user_ma || assignment.userId, 0);
    if (!pickedCustomerIds.includes(userId)) {
      await assignmentCollection.deleteOne({ _id: assignment._id });
    }
  }

  for (const userId of pickedCustomerIds) {
    const existing = currentMap.get(userId);
    if (existing) {
      await assignmentCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            maxUses,
            status: 'active',
            updatedAt: new Date().toISOString(),
          },
        }
      );
      continue;
    }

    await assignmentCollection.insertOne({
      id: runningId,
      vc_ma: numericVoucherId,
      user_ma: userId,
      maxUses,
      usedCount: 0,
      da_su_dung: 0,
      status: 'active',
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    runningId += 1;
  }

  await getCollection('voucher').updateOne(
    { _id: voucher._id },
    {
      $set: {
        vc_scope: 'private',
        vc_solan_sudung_toi_da: maxUses,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  const assignedUsers = await listCustomerAssignments(numericVoucherId);
  return assignedUsers.map(normalizeAssignmentRecord);
}

async function listVisibleVouchersForUser(userId) {
  const vouchers = await getCollection('voucher').find({}).sort({ vc_ma: -1 }).toArray();
  const numericUserId = toNumber(userId, 0);
  const assignments = numericUserId > 0
    ? await getCollection('voucher_khachhang').find({
      $or: [
        { user_ma: numericUserId },
        { user_ma: String(numericUserId) },
        { userId: numericUserId },
        { userId: String(numericUserId) },
      ],
    }).toArray().catch(() => [])
    : [];

  const assignmentMap = new Map(assignments.map((item) => [toNumber(item.vc_ma, 0), normalizeAssignmentRecord(item)]));

  const now = new Date();
  const visible = vouchers
    .map((voucher) => {
      const voucherId = toNumber(voucher.vc_ma || voucher.id, 0);
      return toVoucherView(voucher, assignmentMap.get(voucherId) || null);
    })
    .filter((voucher) => {
      if (voucher.status === 'locked') {
        return false;
      }

      if (voucher.scope === 'private') {
        return Boolean(voucher.assignment && voucher.assignment.status === 'active');
      }

      const start = parseDateValue(voucher.startDate);
      const end = parseDateValue(voucher.endDate);
      if (start && now < start) {
        return false;
      }

      if (end && now > end) {
        return false;
      }

      return true;
    });

  return {
    publicVouchers: visible.filter((item) => item.scope === 'public'),
    privateVouchers: visible.filter((item) => item.scope === 'private'),
    all: visible,
  };
}

async function validateVoucherCode({ voucherCode, userId, subtotal }) {
  const code = String(voucherCode || '').trim().toUpperCase();

  if (!code) {
    return { isValid: false, message: 'Vui lòng nhập mã voucher.' };
  }

  const voucher = await getCollection('voucher').findOne({ vc_code: code });
  if (!voucher) {
    return { isValid: false, message: 'Mã voucher không tồn tại.' };
  }

  const mappedVoucher = toVoucherView(voucher);
  if (mappedVoucher.status !== 'active') {
    if (mappedVoucher.status === 'expired') {
      return { isValid: false, message: 'Voucher đã hết hạn.' };
    }
    if (mappedVoucher.status === 'scheduled') {
      return { isValid: false, message: 'Voucher chưa đến thời gian sử dụng.' };
    }
    if (mappedVoucher.status === 'out_of_stock') {
      return { isValid: false, message: 'Voucher đã hết lượt sử dụng.' };
    }
    return { isValid: false, message: 'Voucher đang bị khóa.' };
  }

  const orderSubtotal = Math.max(0, toNumber(subtotal, 0));
  if (orderSubtotal < mappedVoucher.minAmount) {
    return {
      isValid: false,
      message: `Đơn hàng cần tối thiểu ${mappedVoucher.minAmount.toLocaleString('vi-VN')} đ để dùng voucher này.`,
      voucher: mappedVoucher,
    };
  }

  let assignment = null;
  if (mappedVoucher.scope === 'private') {
    const numericUserId = toNumber(userId, 0);
    if (!numericUserId) {
      return { isValid: false, message: 'Voucher này chỉ dành cho khách hàng được chỉ định.' };
    }

    const assignmentDoc = await getCollection('voucher_khachhang').findOne({
      vc_ma: toNumber(mappedVoucher.id, 0),
      $or: [
        { user_ma: numericUserId },
        { user_ma: String(numericUserId) },
        { userId: numericUserId },
        { userId: String(numericUserId) },
      ],
    });
    assignment = normalizeAssignmentRecord(assignmentDoc || {});

    if (!assignmentDoc || assignment.status !== 'active') {
      return { isValid: false, message: 'Bạn không thuộc danh sách áp dụng voucher này.' };
    }

    if (assignment.usedCount >= assignment.maxUses) {
      return { isValid: false, message: 'Bạn đã dùng hết lượt của voucher này.' };
    }
  }

  const discountAmount = calculateDiscount(orderSubtotal, mappedVoucher);

  return {
    isValid: discountAmount > 0,
    message: discountAmount > 0 ? 'Voucher hợp lệ.' : 'Voucher không tạo ra mức giảm cho đơn này.',
    discountAmount,
    voucher: mappedVoucher,
    assignment,
  };
}

async function consumeVoucherUsage({ voucherId, userId }) {
  const voucher = await findVoucherDocument(voucherId);
  if (!voucher) {
    return;
  }

  await getCollection('voucher').updateOne(
    { _id: voucher._id },
    {
      $set: { updatedAt: new Date().toISOString() },
      $inc: { vc_dasudung: 1 },
    }
  );

  if (getVoucherScope(voucher) === 'private') {
    const numericUserId = toNumber(userId, 0);
    if (numericUserId > 0) {
      await getCollection('voucher_khachhang').updateOne(
        { vc_ma: toNumber(voucher.vc_ma || voucher.id, 0), user_ma: numericUserId },
        {
          $set: { updatedAt: new Date().toISOString() },
          $inc: { usedCount: 1, da_su_dung: 1 },
        }
      );
    }
  }
}

module.exports = {
  toNumber,
  normalizeText,
  calculateDiscount,
  toVoucherView,
  listAdminVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  updateVoucherStatus,
  assignCustomersToVoucher,
  listCustomerAssignments,
  listVisibleVouchersForUser,
  validateVoucherCode,
  consumeVoucherUsage,
};
