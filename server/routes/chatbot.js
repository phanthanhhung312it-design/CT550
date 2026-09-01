const express = require('express');
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const path = require('path');
const { listBestSellerProducts, listProducts } = require('../services/productService');
const { isDbConnected } = require('../config/db');
const { publishChatEvent, subscribeChatEvents } = require('../utils/chatSyncHub');

const router = express.Router();

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSessionUserId(session) {
  return toNumber(session?.user_ma ?? session?.userId ?? session?.user ?? 0, 0) || null;
}

function getSessionToken(session) {
  return String(session?.session_token || session?.sessionId || session?.id || '');
}

function getMessageSortValue(message) {
  const numericId = Number(message?.tn_ma ?? message?.id ?? NaN);
  if (Number.isFinite(numericId)) {
    return numericId;
  }

  const candidate = message?.created_at || message?.createdAt || message?.updated_at || message?.updatedAt || 0;
  const parsedDate = new Date(candidate);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  const parsedNumber = Number(candidate);
  return Number.isFinite(parsedNumber) ? parsedNumber : 0;
}

function isHumanAssignedSession(session) {
  return Number(session?.ph_da_chuyenchonv) === 1 || Number(session?.nv_ma || 0) > 0;
}

function shouldSkipBotReply(session, humanOnly = false) {
  return Boolean(humanOnly) || isHumanAssignedSession(session);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCompletedOrderStatus(value) {
  const normalized = normalizeText(value);
  return ['hoan thanh', 'hoan tat', 'da giao', 'giao thanh cong', 'completed', 'done']
    .some((status) => normalized.includes(status));
}

function isVisibleReviewStatus(value) {
  const normalized = normalizeText(value || 'Hiển thị').replace(/[^a-z]/g, '');
  return normalized !== 'an';
}

function parsePlayersRange(value) {
  const text = String(value || '');
  const matches = text.match(/(\d+)/g) || [];
  if (matches.length === 0) {
    return { min: 1, max: 99 };
  }

  if (matches.length === 1) {
    const amount = toNumber(matches[0], 1);
    return { min: amount, max: amount };
  }

  return {
    min: Math.min(toNumber(matches[0], 1), toNumber(matches[1], 99)),
    max: Math.max(toNumber(matches[0], 1), toNumber(matches[1], 99)),
  };
}

function parseAge(value) {
  const text = String(value || '');
  const match = text.match(/(?:tuoi|age|do tuoi)\s*(\d{1,2})\s*\+?/i)
    || text.match(/(\d{1,2})\s*\+\s*(?:tuoi|age)/i);

  if (match) {
    return toNumber(match[1] || match[2], 0);
  }

  if (/^\d{1,2}\+$/.test(text.replace(/\s+/g, ''))) {
    return toNumber(text.replace(/\D/g, ''), 0);
  }

  return 0;
}

function parsePlayTime(value) {
  const match = String(value || '').match(/(\d{1,3})/);
  return match ? toNumber(match[1], 0) : 0;
}

function withCurrentPrice(product) {
  const basePrice = toNumber(product?.price, 0);
  const discount = Math.min(100, Math.max(0, toNumber(product?.discount, 0)));
  const currentPrice = Math.round(basePrice * (1 - discount / 100));
  return {
    ...product,
    price: basePrice,
    originalPrice: basePrice,
    currentPrice,
    discountedPrice: currentPrice,
    isOnSale: discount > 0 && currentPrice < basePrice,
  };
}

function inferDifficulty(product) {
  const haystack = normalizeText([
    product.category,
    product.description,
    ...(product.labels || []),
  ].join(' '));

  if (/(party|gia dinh|nhap mon|nhanh|de hoc)/.test(haystack)) {
    return 'Dễ';
  }

  if (/(chien luoc|kinh te|suy luan|co-op|co op|logic)/.test(haystack)) {
    return 'Trung bình';
  }

  if (/(kho hon|nang|chuyen sau|hardcore)/.test(haystack)) {
    return 'Khó';
  }

  return 'Trung bình';
}

function parseBudget(text) {
  const normalized = normalizeText(text);
  const candidateMatches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu|dong)?/g)];
  if (candidateMatches.length === 0) {
    return null;
  }

  const values = candidateMatches
    .map((match) => {
      let value = Number(String(match[1] || '').replace(/[,]/g, '.'));
      if (!Number.isFinite(value)) {
        return null;
      }

      const unit = match[2] || '';
      const isMoneyContext = unit || value >= 1000;
      if (!isMoneyContext) {
        return null;
      }

      if (unit === 'trieu') {
        value *= 1000000;
      } else if (unit === 'k' || unit === 'nghin' || unit === 'ngan') {
        value *= 1000;
      } else if (value < 10000) {
        value *= 1000;
      }

      return value;
    })
    .filter((item) => Number.isFinite(item));

  if (values.length === 0) {
    return null;
  }

  const hasBelow = /(duoi|nho hon|it hon|<)/.test(normalized);
  const hasAbove = /(tren|hon|>|tu\s*\d)/.test(normalized);
  const hasRange = /(den|d?n|toi da|tu\s*\d+\s*(den|d?n)|\d+\s*[-–]\s*\d+)/.test(normalized);

  if (hasBelow && values.length > 0) {
    return { min: 0, max: Math.max(...values) };
  }

  if (hasAbove && values.length > 0) {
    return { min: Math.min(...values), max: Number.MAX_SAFE_INTEGER };
  }

  if (hasRange && values.length >= 2) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  if (values.length > 1) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  return { min: 0, max: Math.max(...values) };
}

function extractPreferences(message, availableTags) {
  const normalized = normalizeText(message);
  const preferences = {
    players: null,
    playersRange: null,
    age: null,
    playTime: null,
    difficulty: null,
    category: null,
    budget: null,
  };

  const playersRangeMatch = normalized.match(/(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:nguoi|nguoi choi|ng|player|players)\b/);
  if (playersRangeMatch) {
    const start = toNumber(playersRangeMatch[1], 0);
    const end = toNumber(playersRangeMatch[2] || playersRangeMatch[1], start);
    preferences.playersRange = { min: Math.min(start, end), max: Math.max(start, end) };
    preferences.players = start;
  } else {
    const playersMatch = normalized.match(/(\d+)\s*(?:nguoi|nguoi choi|ng|player|players)\b/);
    if (playersMatch) {
      preferences.players = toNumber(playersMatch[1], 0);
    }
  }

  const ageMatch = normalized.match(/(\d{1,2})\s*\+?\s*(?:tuoi|tuoi)?/);
  if (ageMatch) {
    preferences.age = toNumber(ageMatch[1], 0);
  }

  const timeMatch = normalized.match(/(\d{1,3})\s*(?:phut|p)\b/);
  if (timeMatch) {
    preferences.playTime = toNumber(timeMatch[1], 0);
  }

  if (normalized.includes('de') || normalized.includes('de choi')) {
    preferences.difficulty = 'Dễ';
  } else if (normalized.includes('trung binh')) {
    preferences.difficulty = 'Trung bình';
  } else if (normalized.includes('kho')) {
    preferences.difficulty = 'Khó';
  }

  const matchedTag = availableTags.find((tag) => normalized.includes(normalizeText(tag)));
  if (matchedTag) {
    preferences.category = matchedTag;
  }

  preferences.budget = parseBudget(message);
  return preferences;
}

function normalizePreferencesFromPython(pyPrefs) {
  if (!pyPrefs || typeof pyPrefs !== 'object') return null;
  const prefs = {};
  // players
  prefs.players = toNumber(pyPrefs.players ?? pyPrefs.player ?? (pyPrefs.playersRange && pyPrefs.playersRange.min) ?? 0, 0) || null;
  // age
  prefs.age = toNumber(pyPrefs.age ?? pyPrefs.min_age ?? 0, 0) || null;
  // play time
  prefs.playTime = toNumber(pyPrefs.play_time ?? pyPrefs.playTime ?? pyPrefs.playTimeValue ?? 0, 0) || null;
  // category
  prefs.category = pyPrefs.category || pyPrefs.tag || null;
  // difficulty
  prefs.difficulty = pyPrefs.difficulty || null;
  // budget: if python returned a number, convert to {min:0,max:number}
  const b = pyPrefs.budget ?? pyPrefs.price ?? null;
  if (b && typeof b === 'object') {
    prefs.budget = { min: toNumber(b.min, 0), max: toNumber(b.max, Number.MAX_SAFE_INTEGER) };
  } else if (b && Number.isFinite(Number(b))) {
    prefs.budget = { min: 0, max: toNumber(b, 0) };
  } else {
    prefs.budget = null;
  }

  return prefs;
}

function buildQuickReplies() {
  return [
    'Tìm game cho 4 người',
    'Luật chơi Catan',
    'Hỗ trợ thuê board game',
  ];
}

function createResourceLink(label, path, description = '') {
  return { label, path, description };
}

function repairVietnamese(value) {
  const text = String(value || '').replace(/\uFFFD/g, '?');
  const dictionary = {
    'Dang x? l�': 'Đang xử lý',
    'D� thanh to�n': 'Đã thanh toán',
    'D� x�c nh?n': 'Đã xác nhận',
    'C?p nh?t t? admin test': 'Cập nhật từ admin',
  };

  return dictionary[text] || text;
}

function repairVietnameseText(value) {
  let text = repairVietnamese(value);

  const replacements = [
    [/Lu\?t choi Catan/gi, 'Luật chơi Catan'],
    [/Lu\?t ch\?i Catan/gi, 'Luật chơi Catan'],
    [/lu\?t choi Catan/gi, 'luật chơi Catan'],
    [/lu\?t ch\?i Catan/gi, 'luật chơi Catan'],
    [/Don h\?ng/gi, 'Đơn hàng'],
    [/don h\?ng/gi, 'đơn hàng'],
    [/dang \? d\?u\?/gi, 'đang ở đâu?'],
    [/dang \? d\?u/gi, 'đang ở đâu'],
    [/d\?u\?/gi, 'đâu?'],
    [/d\?u/gi, 'đâu'],
    [/Voucher c\?a m\?nh kh\?ng d\?ng du\?c/gi, 'Voucher của mình không dùng được'],
    [/Voucher c\?a m\?nh kh\?ng d\?ng du\?c\./gi, 'Voucher của mình không dùng được.'],
    [/c\?a/g, 'của'],
    [/m\?nh/g, 'mình'],
    [/kh\?ng/g, 'không'],
    [/h\?ng/g, 'hàng'],
    [/dang/g, 'đang'],
    [/d\?ng/g, 'dùng'],
    [/du\?c/g, 'được'],
    [/x\?c nh\?n/g, 'xác nhận'],
    [/thanh to\?n/g, 'thanh toán'],
    [/x\? l\?/g, 'xử lý'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text;
}

function mapSenderType(value) {
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'bot') {
    return 'bot';
  }

  if (value === 2 || value === '2' || String(value).toLowerCase() === 'employee') {
    return 'employee';
  }

  return 'customer';
}

function findRuleGuide(normalized, products) {
  const productAliases = [
    ['sushi go party', 'Sushi Go!'],
    ['sushi go', 'Sushi Go!'],
    ['ticket to ride', 'Ticket to Ride'],
    ['werewolf', 'Werewolf'],
    ['wingspan', 'Wingspan'],
    ['catan', 'Catan'],
  ];
  const matchedAlias = productAliases.find(([alias]) => normalized.includes(alias));
  const matchedProduct = matchedAlias
    ? products.find((product) => normalizeText(product.name) === normalizeText(matchedAlias[1]))
    : products
      .slice()
      .sort((left, right) => normalizeText(right.name).length - normalizeText(left.name).length)
      .find((product) => normalized.includes(normalizeText(product.name)));

  if (!matchedProduct) {
    return {
      reply: 'Bạn hãy cho mình biết tên game cụ thể để mình mở đúng trang sản phẩm và hướng dẫn luật chơi trên Board Game VN.',
      resourceLinks: [createResourceLink('Xem danh mục game', '/catalog', 'Chọn game để xem thông tin và hướng dẫn luật chơi.')],
    };
  }

  const verifiedRuleUrls = {
    catan: 'https://boardgame.vn/blogs/tin-tuc/huong-dan-cach-choi-board-game-catan-cho-nguoi-moi-cho',
    azul: 'https://boardgame.vn/blogs/tin-tuc/review-chi-tiet-board-game-azul-tuyet-tac-trang-tri-cung-dien-hoang-gia',
    'ticket to ride': 'https://boardgame.vn/blogs/tin-tuc/best-version-cua-tiket-to-ride',
    werewolf: 'https://boardgame.vn/blogs/tin-tuc/luat-choi-cach-choi-board-game-ma-soi-co-ban',
    'sushi go!': 'https://boardgame.vn/blogs/tin-tuc/review-card-game-sushi-go-sushi-bang-chuyen',
    wingspan: 'https://boardgame.vn/blogs/tin-tuc/gioi-thieu-board-game-wingspan-oceania-expansion',
  };
  const ruleUrl = verifiedRuleUrls[normalizeText(matchedProduct.name)] || `/product/${matchedProduct.id}`;

  return {
    reply: `Bạn có thể xem hướng dẫn và luật chơi chi tiết của ${matchedProduct.name} tại trang Board Game VN.`,
    resourceLinks: [createResourceLink(
      `Xem luật chơi ${matchedProduct.name}`,
      ruleUrl,
      'Mở trang sản phẩm để xem thông tin và hướng dẫn luật chơi.',
    )],
  };
}

function looksLikeRuleQuestion(message) {
  const normalized = normalizeText(message);
  return /(luat choi|cach choi|choi sao|choi nhu the nao|huong dan choi|giai thich cach choi|doi tai nguyen)/.test(normalized);
}

function normalizeOrderInfo(order) {
  if (!order) {
    return null;
  }

  return {
    type: 'order',
    orderNumber: order.orderNumber || order.id || '',
    status: repairVietnamese(order.status || 'Chờ xác nhận'),
    paymentMethod: order.paymentMethod || 'Chưa xác định',
    totalAmount: toNumber(order.total || order.totalAmount || 0, 0),
    eta: repairVietnamese(order.eta || ''),
    update: repairVietnamese(order.update || ''),
  };
}

function looksLikeOrderQuestion(message) {
  const repaired = repairVietnameseText(message);
  const rawLower = String(repaired || '').toLowerCase();
  const normalized = normalizeText(message);

  if (normalized.includes('ho tro') && !/(kiem tra|xem|trang thai|o dau|dang o dau|bao gio|chua nhan|giao tre|ma don)/.test(normalized)) {
    return false;
  }

  return /(don hang|don mua|trang thai|dang giao|da giao|ma don)/.test(normalized)
    || /(đơn hàng|đơn mua|trạng thái|đang giao|đã giao|mã đơn)/.test(rawLower)
    || /(don hang|don mua|trang thai|dang giao|da giao|ma don)/.test(normalizeText(repaired));
}

async function findTrackedOrder(message, userId) {
  if (!looksLikeOrderQuestion(message)) {
    return null;
  }

  if (!isDbConnected()) {
    return {
      reply: 'Mình chưa thể tra cứu trạng thái đơn hàng vì cơ sở dữ liệu hiện chưa kết nối. Vui lòng thử lại sau hoặc mở mục Đơn hàng khi hệ thống hoạt động.',
      resourceLinks: [createResourceLink('Xem đơn hàng', '/orders', 'Mở lịch sử đơn mua của bạn.')],
      orderInfo: null,
    };
  }

  if (!userId) {
    return {
      reply: 'Mình cần bạn đăng nhập để tra cứu đúng đơn hàng. Sau khi đăng nhập, bạn có thể hỏi lại hoặc vào mục Đơn hàng để xem trạng thái chi tiết.',
      resourceLinks: [
        createResourceLink('Xem đơn hàng', '/orders', 'Mở lịch sử đơn mua của bạn.'),
        createResourceLink('Vào tài khoản', '/account', 'Đăng nhập hoặc kiểm tra thông tin tài khoản.'),
      ],
      orderInfo: null,
    };
  }

  const [orders, legacyOrders] = await Promise.all([
    getCollection('orders').find({}).sort({ createdAt: -1, _id: -1 }).toArray().catch(() => []),
    getCollection('donhang').find({}).sort({ dh_taomoi: -1, dh_ma: -1 }).toArray().catch(() => []),
  ]);
  const userOrders = [
    ...orders.filter((order) => String(order.userId || order.user_ma || '') === String(userId)),
    ...legacyOrders
      .filter((order) => String(order.user_ma || '') === String(userId))
      .map((order) => ({
        id: order.dh_ma,
        orderNumber: order.dh_ma,
        userId: order.user_ma,
        status: order.status || 'Chờ xác nhận',
        update: order.update || 'Đơn hàng đang được xử lý.',
        eta: order.eta || 'Thông tin giao hàng sẽ được cập nhật sớm.',
        paymentMethod: order.paymentMethod || 'Chưa xác định',
        totalAmount: order.dh_thanhtien || 0,
        createdAt: order.dh_thoigiandathang || order.dh_taomoi,
      })),
  ];
  if (userOrders.length === 0) {
    return {
      reply: 'Mình chưa thấy đơn mua nào gắn với tài khoản này. Bạn có thể kiểm tra lại tài khoản đăng nhập hoặc vào mục Đơn hàng để xác nhận.',
      resourceLinks: [createResourceLink('Mở trang đơn hàng', '/orders', 'Kiểm tra lịch sử đơn mua của bạn.')],
      orderInfo: null,
    };
  }

  const orderCodeMatch = String(message).match(/DH-?\d+/i);
  const matchedOrder = orderCodeMatch
    ? userOrders.find((order) => String(order.orderNumber || '').toLowerCase() === orderCodeMatch[0].replace(/\s+/g, '').toLowerCase())
    : userOrders[0];

  const orderInfo = normalizeOrderInfo(matchedOrder || userOrders[0]);
  return {
    reply: `Đơn ${orderInfo.orderNumber} hiện đang ở trạng thái ${orderInfo.status}.${orderInfo.update ? ` ${orderInfo.update}` : ''}${orderInfo.eta ? ` ${orderInfo.eta}` : ''}`,
    resourceLinks: [createResourceLink('Theo dõi đơn hàng', '/orders', 'Mở trang đơn hàng để xem chi tiết và lịch sử cập nhật.')],
    orderInfo,
  };
}

async function buildSupportReply(message, userId) {
  const normalized = normalizeText(message);

  if (normalized.includes('ho tro') && /(don hang|don mua)/.test(normalized) && !looksLikeOrderQuestion(message)) {
    return {
      reply: 'Mình có thể hỗ trợ kiểm tra trạng thái, thời gian giao, đơn chưa nhận hoặc yêu cầu hủy đơn. Bạn hãy gửi mã đơn hàng nếu muốn kiểm tra một đơn cụ thể; hệ thống sẽ đối chiếu theo tài khoản đang đăng nhập.',
      resourceLinks: [
        createResourceLink('Xem đơn hàng', '/orders', 'Mở danh sách đơn để lấy mã đơn.'),
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Gửi yêu cầu cho nhân viên nếu cần xử lý đơn hàng.'),
      ],
    };
  }

  if (/(voucher|ma giam|giam gia|khuyen mai)/.test(normalized)) {
    if (/(khong dung|bi loi|loi|khong ap dung|het han|nhap.*khong duoc|khong duoc)/.test(normalized)) {
      return {
        reply: 'Voucher chưa áp dụng được có thể do đã hết hạn, chưa đạt giá trị đơn tối thiểu, hết lượt sử dụng hoặc không áp dụng cho sản phẩm trong giỏ. Bạn hãy kiểm tra mã, thời hạn và điều kiện đơn hàng; nếu vẫn lỗi, gửi mã voucher và mã đơn cho bộ phận hỗ trợ.',
        resourceLinks: [
          createResourceLink('Kiểm tra thanh toán', '/checkout', 'Xem điều kiện và thử áp dụng lại voucher.'),
          createResourceLink('Liên hệ hỗ trợ', '/support', 'Gửi mã voucher và lỗi hiển thị để được kiểm tra.'),
        ],
      };
    }

    if (/(co voucher|voucher cua toi|ma giam gia nao|co ma)/.test(normalized)) {
      return {
        reply: 'Bạn có thể kiểm tra các voucher đang được cấp trong tài khoản hoặc tại trang Thanh toán. Mỗi mã có thời hạn, giá trị đơn tối thiểu và điều kiện sản phẩm riêng.',
        resourceLinks: [createResourceLink('Mở thanh toán', '/checkout', 'Kiểm tra voucher có thể áp dụng cho giỏ hàng hiện tại.')],
      };
    }

    if (/(dung nhieu|nhiều|cung luc|cùng lúc)/.test(normalized)) {
      return {
        reply: 'Việc dùng nhiều voucher cùng lúc phụ thuộc vào điều kiện của từng mã và chính sách của đơn hàng. Bạn hãy thử áp dụng từng mã tại trang Thanh toán; hệ thống sẽ thông báo mã nào được chấp nhận.',
        resourceLinks: [createResourceLink('Mở thanh toán', '/checkout', 'Thử áp dụng voucher trên đơn hàng hiện tại.')],
      };
    }

    return {
      reply: 'Voucher là mã giảm giá dùng khi thanh toán. Bạn nhập mã tại bước Thanh toán, rồi kiểm tra điều kiện áp dụng, giá trị đơn tối thiểu, thời hạn và sản phẩm được hỗ trợ trước khi xác nhận đơn.',
      resourceLinks: [createResourceLink('Mở thanh toán', '/checkout', 'Nhập và kiểm tra mã giảm giá của bạn.')],
    };
  }

  if (/(huy don|hủy đơn)/.test(normalized)) {
    return {
      reply: userId
        ? 'Mình không tự hủy đơn thay bạn qua chatbot. Bạn hãy gửi mã đơn hàng để nhân viên kiểm tra trạng thái; nếu đơn chưa bàn giao vận chuyển, cửa hàng sẽ hướng dẫn yêu cầu hủy theo dữ liệu thực tế.'
        : 'Bạn cần đăng nhập và cung cấp mã đơn hàng để nhân viên kiểm tra khả năng hủy đơn theo trạng thái thực tế.',
      resourceLinks: [
        createResourceLink('Xem đơn hàng', '/orders', 'Mở danh sách đơn để lấy mã đơn.'),
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Gửi yêu cầu hủy đơn cho nhân viên.'),
      ],
    };
  }

  if (/(chua nhan|chua giao|giao tre|giao cham|bao gio nhan|nhan duoc hang)/.test(normalized)) {
    const orderReply = await findTrackedOrder(message, userId);
    if (orderReply) {
      return {
        ...orderReply,
        reply: `${orderReply.reply} Nếu đơn đã quá thời gian dự kiến hoặc chưa nhận được hàng, bạn có thể gửi mã đơn cho nhân viên để được kiểm tra với đơn vị vận chuyển.`,
      };
    }
  }

  const orderReply = await findTrackedOrder(message, userId);
  if (orderReply) {
    return orderReply;
  }

  if (/(thanh toan|momo|vnpay|cod|loi thanh toan)/.test(normalized)) {
    return {
      reply: 'Nếu thanh toán bị lỗi, bạn hãy thử theo thứ tự này: kiểm tra kết nối mạng, xác nhận phương thức thanh toán đang hoạt động, tải lại trang và thực hiện lại giao dịch. Nếu vẫn chưa thành công, hãy lưu mã đơn nếu có và liên hệ hỗ trợ để nhân viên kiểm tra.',
      resourceLinks: [
        createResourceLink('Thử lại thanh toán', '/checkout', 'Quay lại trang thanh toán để thực hiện lại giao dịch.'),
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Gửi thông tin lỗi để được nhân viên hỗ trợ.'),
      ],
    };
  }

  if (/(gio hang|them vao gio|xoa.*gio|thay doi so luong|so luong)/.test(normalized)) {
    return {
      reply: 'Bạn có thể mở Giỏ hàng để xem sản phẩm, thay đổi số lượng hoặc xóa sản phẩm. Khi xem chi tiết sản phẩm, hãy chọn Thêm vào giỏ rồi kiểm tra lại số lượng trước khi thanh toán.',
      resourceLinks: [
        createResourceLink('Mở giỏ hàng', '/cart', 'Xem và chỉnh sửa sản phẩm trong giỏ.'),
        createResourceLink('Xem sản phẩm', '/catalog', 'Chọn thêm board game vào giỏ hàng.'),
      ],
    };
  }

  if (/(quen mat khau|doi mat khau|khong dang nhap|dang nhap|dang ky|so dien thoai|cap nhat thong tin|tai khoan|account|register|dang ky tai khoan)/.test(normalized)) {
    return {
      reply: userId
        ? 'Bạn đang dùng tài khoản của mình. Vui lòng vào mục Tài khoản để kiểm tra thông tin cá nhân, địa chỉ và đơn hàng; nếu cần thay đổi mật khẩu hoặc số điện thoại, hãy sử dụng chức năng cập nhật hồ sơ.'
        : 'Để quản lý tài khoản, đăng nhập hoặc đăng ký trước nhé. Sau khi đăng nhập, bạn có thể vào mục Tài khoản để kiểm tra thông tin, đổi mật khẩu hoặc cập nhật số điện thoại.',
      resourceLinks: [
        createResourceLink('Mở tài khoản', '/account', 'Kiểm tra hồ sơ, số điện thoại và trạng thái đăng nhập.'),
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Nhờ nhân viên hỗ trợ nếu cần xác minh hoặc xử lý lỗi tài khoản.'),
      ],
    };
  }

  if (/(gia han|tra tre|mat quan|thieu phu kien|tra board game|huong dan tra|thue)/.test(normalized)) {
    return {
      reply: 'Với đơn thuê board game, bạn có thể vào mục Thuê BoardGame để xem lịch nhận và trả. Nếu cần gia hạn, trả trễ, làm mất quân cờ hoặc thiếu phụ kiện, hãy báo sớm để cửa hàng kiểm tra chính sách phụ thu, hỗ trợ đổi phụ kiện hoặc hướng dẫn trả hàng đúng quy trình.',
      resourceLinks: [
        createResourceLink('Quản lý đơn thuê', '/rentals', 'Xem đơn thuê, ngày nhận và ngày trả của bạn.'),
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Báo sự cố thuê để được hướng dẫn chi tiết.'),
      ],
    };
  }

  if (/(khieu nai|thieu|hu hong|\bhong\b|mat phu kien|thieu xuc xac|loi san pham)/.test(normalized)) {
    return {
      reply: 'Mình rất tiếc về trải nghiệm này. Bạn hãy kiểm tra lại toàn bộ hộp, chụp ảnh tình trạng sản phẩm hoặc phụ kiện bị thiếu, rồi gửi thông tin cho bộ phận hỗ trợ. Cửa hàng sẽ dựa trên tình trạng thực tế để bổ sung phụ kiện, đổi sản phẩm hoặc hướng dẫn xử lý tiếp theo.',
      resourceLinks: [
        createResourceLink('Liên hệ hỗ trợ', '/support', 'Gửi khiếu nại và hình ảnh sản phẩm để được xử lý.'),
        createResourceLink('Xem đơn hàng', '/orders', 'Mở đơn mua liên quan để cung cấp mã đơn cho nhân viên.'),
      ],
    };
  }

  return null;
}

async function nextNumericId(collectionName, fieldName) {
  if (!isDbConnected()) {
    return 1;
  }

  const row = await getCollection(collectionName).find({ [fieldName]: { $type: 'number' } }).sort({ [fieldName]: -1 }).limit(1).next().catch(() => null);
  return toNumber(row?.[fieldName], 0) + 1;
}

async function loadProductDataset() {
  if (!isDbConnected()) {
    return [];
  }

  const [products, rawProducts, reviews, favorites, topics, topicLinks] = await Promise.all([
    listProducts().catch(() => []),
    getCollection('sanpham').find({}).toArray().catch(() => []),
    getCollection('danhgia').find({}).toArray().catch(() => []),
    getCollection('yeuthich').find({}).toArray().catch(() => []),
    getCollection('chude').find({}).toArray().catch(() => []),
    getCollection('chitietchude').find({}).toArray().catch(() => []),
  ]);

  const productMap = new Map();
  products.forEach((product) => {
    productMap.set(toNumber(product.id, 0), {
      ...product,
      id: toNumber(product.id, 0),
      playersRange: parsePlayersRange(product.players),
      minAge: parseAge(product.age),
      playTimeValue: parsePlayTime(product.playTime),
      difficulty: inferDifficulty(product),
      labels: Array.isArray(product.labels) ? product.labels : [],
    });
  });

  rawProducts.forEach((product) => {
    const productId = toNumber(product.sp_ma, 0);
    const existing = productMap.get(productId) || {};
    const minPlayers = toNumber(product.sp_sokhach_min, 1);
    productMap.set(productId, {
      id: productId,
      name: existing.name || product.sp_ten || `Sản phẩm #${productId}`,
      category: existing.category || product.loai_ten || 'Board game',
      players: existing.players || `${minPlayers}-${Math.max(minPlayers + 2, minPlayers)}`,
      playersRange: existing.playersRange || { min: minPlayers, max: Math.max(minPlayers + 2, minPlayers) },
      age: existing.age || '10+',
      minAge: existing.minAge || 10,
      price: existing.price || toNumber(product.sp_giaban, 0),
      stock: existing.stock ?? toNumber(product.sp_soluong, 0),
      rating: existing.rating || 0,
      reviews: existing.reviews || 0,
      image: existing.image || '/image/catan.jpg',
      playTime: existing.playTime || `${toNumber(product.sp_thoigianchoi, 45)} phút`,
      playTimeValue: existing.playTimeValue || toNumber(product.sp_thoigianchoi, 45),
      publisher: existing.publisher || '',
      brand: existing.brand || '',
      discount: existing.discount || 0,
      labels: existing.labels || [],
      description: existing.description || product.sp_chitiet || '',
      difficulty: existing.difficulty || inferDifficulty(existing),
    });
  });

  const topicMap = new Map(topics.map((item) => [toNumber(item.cd_ma, 0), item.cd_ten || '']));
  const topicNamesByProductId = new Map();
  topicLinks.forEach((item) => {
    const productId = toNumber(item.sp_ma, 0);
    const topicName = topicMap.get(toNumber(item.cd_ma, 0));
    if (!topicName) {
      return;
    }

    const current = topicNamesByProductId.get(productId) || [];
    if (!current.includes(topicName)) {
      current.push(topicName);
      topicNamesByProductId.set(productId, current);
    }
  });

  const reviewStats = new Map();
  reviews.forEach((item) => {
    if (!isVisibleReviewStatus(item.dg_trangthai || item.status)) {
      return;
    }

    const productId = toNumber(item.sp_ma || item.productId, 0);
    if (!productId) {
      return;
    }

    const current = reviewStats.get(productId) || { count: 0, total: 0 };
    current.count += 1;
    current.total += Math.min(5, Math.max(1, toNumber(item.dg_sosao || item.rating, 0)));
    reviewStats.set(productId, current);
  });

  const favoriteCounts = new Map();
  favorites.forEach((item) => {
    const productId = toNumber(item.sp_ma, 0);
    favoriteCounts.set(productId, (favoriteCounts.get(productId) || 0) + 1);
  });

  return [...productMap.values()].map((product) => {
    const stats = reviewStats.get(product.id) || { count: 0, total: 0 };
    return withCurrentPrice({
      ...product,
      topics: topicNamesByProductId.get(product.id) || [],
      rating: stats.count > 0 ? Number((stats.total / stats.count).toFixed(1)) : 0,
      reviews: stats.count,
      favorites: favoriteCounts.get(product.id) || 0,
      rentalPrice: Math.max(10000, Math.round(toNumber(product.currentPrice || product.price, 0) * 0.1)),
    });
  });
}

function getRatingConfidenceScore(product, candidates) {
  const ratings = candidates
    .map((item) => toNumber(item.rating, 0))
    .filter((rating) => rating > 0);
  const baseline = ratings.length > 0
    ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
    : 0;
  const reviewCount = toNumber(product.reviews, 0);
  const minimumReviews = 5;
  return ((toNumber(product.rating, 0) * reviewCount) + (baseline * minimumReviews))
    / (reviewCount + minimumReviews);
}

function getProductIdentifierKeys(product) {
  return [
    toNumber(product?.id, 0),
    toNumber(product?.productId, 0),
    toNumber(product?.sp_ma, 0),
  ].filter((value) => value > 0);
}

function isFavoriteProduct(product, favoriteProductIds) {
  if (!product || !favoriteProductIds) {
    return false;
  }

  const favoriteSet = favoriteProductIds instanceof Set ? favoriteProductIds : new Set(favoriteProductIds);
  const productIds = getProductIdentifierKeys(product);
  return productIds.some((productId) => favoriteSet.has(productId));
}

function getNameVariants(value) {
  const normalized = normalizeText(value);
  const collapsed = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
  const withoutSymbols = collapsed.replace(/\s+/g, ' ');
  return Array.from(new Set([
    normalized,
    collapsed,
    withoutSymbols,
    withoutSymbols.replace(/\s+/g, ''),
  ].filter(Boolean)));
}

function findProductByKnnName(products, candidateName) {
  const nameVariants = getNameVariants(candidateName);

  return products.find((item) => {
    const itemVariants = getNameVariants(item.name);
    return nameVariants.some((variant) => itemVariants.includes(variant))
      || itemVariants.some((variant) => nameVariants.some((candidate) => candidate.includes(variant) || variant.includes(candidate)));
  }) || null;
}

function hydrateKnnRecommendations(recommendations, products) {
  const seen = new Set();

  return recommendations.map((recommendation) => {
    const candidateName = recommendation?.name || '';
    const normalizedName = normalizeText(candidateName);
    const candidateId = toNumber(recommendation.id, 0);

    const productById = candidateId > 0
      ? products.find((item) => getProductIdentifierKeys(item).includes(candidateId))
      : null;

    const productByName = !productById
      ? findProductByKnnName(products, candidateName)
      : null;

    const product = productById || productByName;
    if (!product) {
      return null;
    }

    const productKey = String(getProductIdentifierKeys(product)[0] || normalizeText(product.name) || normalizedName);
    if (seen.has(productKey)) {
      return null;
    }
    seen.add(productKey);

    return {
      ...product,
      reasons: [],
    };
  }).filter(Boolean);
}

function filterKnnRecommendations(recommendations, preferences) {
  if (!preferences) {
    return recommendations;
  }

  return recommendations.filter((product) => {
    if (preferences.players && (
      preferences.players < product.playersRange.min
      || preferences.players > product.playersRange.max
    )) {
      return false;
    }

    const requestedPlayTime = toNumber(preferences.playTime ?? preferences.play_time, 0);
    if (requestedPlayTime && product.playTimeValue) {
      const maxDifference = Math.max(60, requestedPlayTime * 0.75);
      if (Math.abs(product.playTimeValue - requestedPlayTime) > maxDifference) {
        return false;
      }
    }

    if (preferences.budget) {
      if (typeof preferences.budget === 'object') {
        const minBudget = toNumber(preferences.budget.min, 0);
        const maxBudget = Number.isFinite(toNumber(preferences.budget.max, Number.MAX_SAFE_INTEGER))
          ? toNumber(preferences.budget.max, Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;

        if (minBudget > 0 && product.currentPrice < minBudget) {
          return false;
        }

        if (Number.isFinite(maxBudget) && product.currentPrice > maxBudget) {
          return false;
        }
      } else {
        const maxBudget = toNumber(preferences.budget, 0);
        if (maxBudget > 0 && product.currentPrice > maxBudget) {
          return false;
        }
      }
    }

    if (preferences.difficulty && normalizeText(product.difficulty) !== normalizeText(preferences.difficulty)) {
      return false;
    }

    if (preferences.category) {
      const categoryText = normalizeText([
        product.category,
        ...(product.labels || []),
        ...(product.topics || []),
      ].join(' '));
      if (!categoryText.includes(normalizeText(preferences.category))) {
        return false;
      }
    }

    return true;
  });
}

function scoreProduct(product, preferences) {
  let score = 0;
  const reasons = [];

  if (preferences.players) {
    const fitsPlayers = preferences.players >= product.playersRange.min && preferences.players <= product.playersRange.max;
    if (fitsPlayers) {
      score += 35;
      reasons.push(`phù hợp nhóm ${preferences.players} người`);
    }
  }

  if (preferences.age) {
    if (product.minAge <= preferences.age) {
      score += 15;
      reasons.push(`độ tuổi từ ${product.age}`);
    }
  }

  if (preferences.playTime && product.playTimeValue) {
    const diff = Math.abs(product.playTimeValue - preferences.playTime);
    const timeScore = Math.max(0, 20 - diff / 3);
    score += timeScore;
    if (timeScore >= 10) {
      reasons.push(`thời gian chơi khoảng ${product.playTime}`);
    }
  }

  if (preferences.difficulty) {
    if (normalizeText(product.difficulty) === normalizeText(preferences.difficulty)) {
      score += 14;
      reasons.push(`độ khó ${product.difficulty}`);
    }
  }

  if (preferences.category) {
    const categoryHaystack = normalizeText([product.category, ...(product.labels || []), ...(product.topics || []), product.description].join(' '));
    if (categoryHaystack.includes(normalizeText(preferences.category))) {
      score += 22;
      reasons.push(`đúng chủ đề ${preferences.category}`);
    }
  }

  if (preferences.budget) {
    if (product.price >= preferences.budget.min && product.price <= preferences.budget.max) {
      score += 18;
      reasons.push(`nằm trong ngân sách ${product.price.toLocaleString('vi-VN')} đ`);
    } else {
      score -= 16;
    }
  }

  score += Math.min(8, toNumber(product.rating, 0));
  score += Math.min(10, Math.log10((toNumber(product.reviews, 0) || 1) + 1) * 4);
  score += Math.min(6, toNumber(product.favorites, 0));
  return { score, reasons };
}

function sortRecommendationsByFavorites(recommendations, favoriteProductIds) {
  if (!Array.isArray(recommendations) || !favoriteProductIds) {
    return recommendations;
  }

  const favoriteSet = favoriteProductIds instanceof Set ? favoriteProductIds : new Set(favoriteProductIds);
  return [...recommendations].sort((left, right) => {
    const leftIsFavorite = isFavoriteProduct(left, favoriteSet) ? 1 : 0;
    const rightIsFavorite = isFavoriteProduct(right, favoriteSet) ? 1 : 0;
    return rightIsFavorite - leftIsFavorite;
  });
}

async function sortRecommendationsByPopularity(recommendations) {
  if (!Array.isArray(recommendations)) {
    return recommendations;
  }

  const sales = await loadSalesCounts();
  return [...recommendations]
    .map((product) => ({
      ...product,
      salesCount: sales.get(toNumber(product.id, 0)) || 0,
    }))
    .sort((left, right) => {
      const leftValue = toNumber(left.salesCount, 0);
      const rightValue = toNumber(right.salesCount, 0);
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }
      return toNumber(right.rating, 0) - toNumber(left.rating, 0);
    });
}

function sortRecommendationsByRating(recommendations) {
  if (!Array.isArray(recommendations)) {
    return recommendations;
  }

  const scored = recommendations.map((product) => ({
    ...product,
    ratingConfidenceScore: getRatingConfidenceScore(product, recommendations),
  }));

  return scored.sort((left, right) => {
    const scoreDiff = right.ratingConfidenceScore - left.ratingConfidenceScore;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const ratingDiff = toNumber(right.rating, 0) - toNumber(left.rating, 0);
    if (ratingDiff !== 0) {
      return ratingDiff;
    }
    return toNumber(right.reviews, 0) - toNumber(left.reviews, 0);
  });
}

function buildRecommendationExplanation(recommendations, preferences) {
  if (recommendations.length === 0) {
    return 'Mình chưa tìm thấy board game khớp hoàn toàn với nhu cầu vừa nhập. Bạn có thể nới rộng ngân sách hoặc thời gian chơi để mình gợi ý thêm.';
  }

  const topProduct = recommendations[0];
  const reasonText = topProduct.reasons.slice(0, 3).join(', ');
  const preferenceSummary = [
    preferences.players ? `${preferences.players} người` : null,
    preferences.age ? `${preferences.age}+` : null,
    preferences.playTime ? `${preferences.playTime} phút` : null,
    preferences.difficulty || null,
    preferences.category || null,
  ].filter(Boolean).join(' | ');

  return `Dựa trên nhu cầu ${preferenceSummary || 'bạn vừa mô tả'}, mình gợi ý ưu tiên ${topProduct.name} vì ${reasonText || 'đây là lựa chọn cân bằng nhất theo dữ liệu hiện có'}.`;
}

function buildFavoritePrioritySentence(favoriteNames) {
  if (!Array.isArray(favoriteNames) || favoriteNames.length === 0) {
    return '';
  }

  const uniqueNames = [...new Set(favoriteNames.filter(Boolean))];
  if (uniqueNames.length === 0) {
    return '';
  }

  const listText = uniqueNames.length === 1
    ? uniqueNames[0]
    : uniqueNames.length === 2
      ? `${uniqueNames[0]} và ${uniqueNames[1]}`
      : `${uniqueNames.slice(0, -1).join(', ')}, và ${uniqueNames[uniqueNames.length - 1]}`;

  return uniqueNames.length === 1
    ? `${listText} đã được bạn thêm vào danh sách yêu thích nên mình ưu tiên game này lên đầu.`
    : `${listText} đã được bạn thêm vào danh sách yêu thích nên mình ưu tiên các game này lên đầu.`;
}

function buildPreferenceSummary(preferences) {
  if (!preferences) {
    return '';
  }

  const segments = [];

  if (preferences.playersRange) {
    const { min, max } = preferences.playersRange;
    segments.push(min === max ? `${min} người` : `${min}–${max} người`);
  } else if (preferences.players) {
    segments.push(`${preferences.players} người`);
  }

  if (preferences.playTime) {
    segments.push(`khoảng ${preferences.playTime} phút`);
  }

  if (preferences.budget) {
    const { min, max } = preferences.budget;
    if (Number.isFinite(max) && max < Number.MAX_SAFE_INTEGER) {
      if (min > 0 && Number.isFinite(min)) {
        segments.push(`giá từ ${Math.round(min).toLocaleString('vi-VN')}đ đến ${Math.round(max).toLocaleString('vi-VN')}đ`);
      } else {
        segments.push(`giá dưới ${Math.round(max).toLocaleString('vi-VN')}đ`);
      }
    } else if (Number.isFinite(min) && min > 0) {
      segments.push(`giá trên ${Math.round(min).toLocaleString('vi-VN')}đ`);
    }
  }

  if (preferences.difficulty) {
    segments.push(`độ khó ${preferences.difficulty}`);
  }

  if (preferences.category) {
    segments.push(`thể loại ${preferences.category}`);
  }

  if (preferences.age) {
    segments.push(`tuổi ${preferences.age}+`);
  }

  return segments.join(', ');
}

function buildRecommendationLeadSentence(recommendations, preferences = null) {
  const validRecommendations = Array.isArray(recommendations) ? recommendations.filter((item) => item && item.name) : [];
  if (validRecommendations.length === 0) {
    return '';
  }

  const preferenceSummary = buildPreferenceSummary(preferences);
  return preferenceSummary
    ? `Mình đã hiểu nhu cầu của bạn: ${preferenceSummary}. Dựa trên các tiêu chí này, mình đề xuất các game phù hợp nhất trong Top 5.`
    : 'Mình đề xuất các game phù hợp nhất trong Top 5 cho bạn.';
}

function buildFaqReply(message) {
  const normalized = normalizeText(message);

  if (/(^|\b)(xin chao|chao|hello|hi|hey|chào|alo|co ai|ai o day)(\b|$)/.test(normalized)) {
    return 'Chào bạn! Mình là Chatbot AI tư vấn BoardGame, bạn cần hỗ trợ gì hôm nay?';
  }

  if (/(^|\b)(cam on|cam on ban|cảm on|cảm ơn|thank you|thanks|thank|rất cảm ơn|rat cam on)(\b|$)/.test(normalized)) {
    return 'Cảm ơn bạn! Mình luôn sẵn sàng hỗ trợ bạn với gợi ý game, thông tin sản phẩm và các câu hỏi mua hàng.';
  }

  if (/(^|\b)(tam biet|bye|see you|hen gap lai|hẹn gặp lại|chao tam biet|tạm biệt|tam biet)(\b|$)/.test(normalized)) {
    return 'Chúc bạn có một ngày vui vẻ! Nếu cần thêm, cứ nhắn lại cho mình nhé.';
  }

  if (normalized.includes('thue')) {
    return 'Bạn có thể vào mục Thuê BoardGame, chọn ngày nhận - ngày trả, thêm trò chơi vào đơn thuê rồi xác nhận địa chỉ, thanh toán và đơn vị giao nhận.';
  }

  if (normalized.includes('mua') || normalized.includes('gio hang') || normalized.includes('thanh toan')) {
    return 'Bạn có thể xem chi tiết sản phẩm, thêm vào giỏ hàng, sau đó vào trang Giỏ hàng hoặc Thanh toán để hoàn tất đơn mua.';
  }

  if (normalized.includes('ban chay')) {
    return 'Mình sẽ ưu tiên các board game có điểm đánh giá cao, nhiều lượt yêu thích và nhiều lượt mua gần đây để gợi ý cho bạn.';
  }

  return '';
}

function buildProductInfoReply(message, products) {
  const normalized = normalizeText(message);
  const matchedProduct = products.find((product) => normalized.includes(normalizeText(product.name)));
  if (!matchedProduct) {
    return null;
  }

  return {
    reply: `${matchedProduct.name} hiện có giá ${Number(matchedProduct.price || 0).toLocaleString('vi-VN')} đ, chơi ${matchedProduct.players}, thời lượng khoảng ${matchedProduct.playTime || '45 phút'}, phù hợp độ tuổi ${matchedProduct.age}.`,
    recommendations: [
      {
        ...matchedProduct,
        reasons: ['trùng sản phẩm bạn đang hỏi'],
      },
    ],
  };
}

function isProductInfoQuestion(message, products) {
  const normalized = normalizeText(message);
  const matchedProduct = products.find((product) => normalized.includes(normalizeText(product.name)));
  return Boolean(matchedProduct && /(thong tin|gia|bao nhieu|ton kho|con hang|danh gia|review|nguoi choi|do tuoi|thoi gian|bao lau|the loai|de choi|de hoc|kho choi)/.test(normalized));
}

function extractRequestedPlayers(message) {
  const normalized = normalizeText(message);
  const numberWords = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
  const match = normalized.match(/\b(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(nguoi|ng|nguoi choi)\b/);
  if (!match) {
    return null;
  }

  return match[1].match(/^\d+$/) ? toNumber(match[1], 0) : numberWords[match[1]];
}

function isPopularityQuestion(message) {
  const normalized = normalizeText(message);
  return /(game pho bien nhat|pho bien nhat|ban chay nhat|ban nhieu nhat|mua nhieu nhat|best seller|best selling|game pho bien|san pham pho bien)/.test(normalized);
}

function isRatingQuestion(message) {
  const normalized = normalizeText(message);
  return /(danh gia|rating|nhieu sao|sao cao)/.test(normalized);
}

function isRecommendationRequest(message) {
  const normalized = normalizeText(message);
  return /(tim game|goi y game|game nao|game cho|phu hop|board ?game|nguoi choi|de xuat|chon game|game phu hop|\b\d+\s*(nguoi|ng)\b|\b\d+\s*(phut|p)\b|\bduoi\b|\btren\b|\bden\b|\bkhoang\b|\bde\b|\btrung binh\b|\bkho\b)/.test(normalized);
}

function isSupportRequest(message) {
  const normalized = normalizeText(message);
  return /(ho tro|voucher|ma giam|khuyen mai|huy don|chua nhan|giao tre|giao cham|don hang|don mua|thanh toan|tra hang|thue|thue game|muon thue|loi|su co|bao gio)/.test(normalized);
}

async function loadUserFavoriteIds(userId) {
  const numericUserId = toNumber(userId, 0);
  if (!isDbConnected() || !numericUserId) {
    return new Set();
  }

  const rows = await getCollection('yeuthich')
    .find({
      $or: [
        { user_ma: numericUserId },
        { user_ma: String(numericUserId) },
        { userId: numericUserId },
        { userId: String(numericUserId) },
      ],
    })
    .project({ _id: 0, sp_ma: 1, productId: 1 })
    .toArray()
    .catch(() => []);

  return new Set(rows
    .map((row) => toNumber(row.sp_ma ?? row.productId, 0))
    .filter((productId) => productId > 0));
}

async function loadSalesCounts() {
  const bestSellers = await listBestSellerProducts().catch(() => []);
  if (bestSellers.length > 0) {
    return new Map(bestSellers.map((product) => [toNumber(product.id, 0), toNumber(product.soldQuantity, 0)]));
  }

  const [orders, legacyOrders, legacyItems] = await Promise.all([
    getCollection('orders').find({}).toArray().catch(() => []),
    getCollection('donhang').find({}).project({ dh_ma: 1, status: 1, dh_trangthai: 1 }).toArray().catch(() => []),
    getCollection('chitietdonhang').find({}).toArray().catch(() => []),
  ]);

  const sales = new Map();
  orders.forEach((order) => {
    if (!isCompletedOrderStatus(order.status || order.dh_trangthai)) {
      return;
    }
    (Array.isArray(order.items) ? order.items : []).forEach((item) => {
      const productId = toNumber(item.productId || item.sp_ma, 0);
      if (productId > 0) {
        sales.set(productId, (sales.get(productId) || 0) + Math.max(0, toNumber(item.quantity || item.ctdh_soluong, 0)));
      }
    });
  });

  const modernOrderKeys = new Set(orders.map((order) => String(order.orderNumber || order.id || '').trim()).filter(Boolean));
  const legacyOrderKeys = new Set(legacyOrders
    .filter((order) => isCompletedOrderStatus(order.status || order.dh_trangthai))
    .map((order) => String(order.dh_ma || '').trim())
    .filter((key) => key && !modernOrderKeys.has(key)));
  legacyItems.forEach((item) => {
    if (!legacyOrderKeys.has(String(item.dh_ma || '').trim())) {
      return;
    }

    const productId = toNumber(item.sp_ma, 0);
    if (productId > 0) {
      sales.set(productId, (sales.get(productId) || 0) + Math.max(0, toNumber(item.ctdh_soluong, 0)));
    }
  });

  return sales;
}

async function buildFactualProductReply(message, products) {
  const normalized = normalizeText(message);
  const matchedProduct = products.find((product) => normalized.includes(normalizeText(product.name)));
  const factualProductQuestion = Boolean(matchedProduct && /(gia|bao nhieu|ton kho|con hang|danh gia|review|thong tin|san pham|nguoi choi|choi bao nhieu|do tuoi|tuoi nao|thoi gian|bao lau|the loai|de choi|de hoc|kho choi|nguoi moi|gia dinh)/.test(normalized));

  if (!matchedProduct || !factualProductQuestion) {
    return null;
  }

  if (!isDbConnected()) {
    return {
      reply: 'Mình chưa thể trả số liệu sản phẩm thực tế vì cơ sở dữ liệu hiện chưa kết nối. Vui lòng thử lại sau.',
      recommendations: [],
    };
  }

  return {
    reply: `${matchedProduct.name}: giá ${toNumber(matchedProduct.currentPrice ?? matchedProduct.price, 0).toLocaleString('vi-VN')} đ; ${matchedProduct.stock > 0 ? `còn ${matchedProduct.stock} sản phẩm` : 'hiện hết hàng'}; chơi ${matchedProduct.players} người; độ tuổi ${matchedProduct.age}; thời lượng ${matchedProduct.playTime || 'chưa cập nhật'}; thể loại ${matchedProduct.category}; độ khó ${matchedProduct.difficulty}; đánh giá ${Number(matchedProduct.rating || 0).toFixed(1)}/5 từ ${toNumber(matchedProduct.reviews, 0)} lượt đánh giá.`,
    recommendations: [{ ...matchedProduct, reasons: ['thông tin sản phẩm từ MongoDB'] }],
  };
}

async function runPythonChatbot(message, products = [], requestedTopK = 20) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../py/api.py');
    const pythonProcess = spawn(process.env.PYTHON_BIN || 'python', [scriptPath], {
      cwd: path.resolve(__dirname, '../../py'),
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    pythonProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Python chatbot failed'));
        return;
      }

      try {
        const payload = JSON.parse(stdout.trim() || '{}');
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });

    pythonProcess.stdin.write(JSON.stringify({
      message: normalizeText(message),
      catalog_names: products.map((product) => product.name).filter(Boolean),
      top_k: requestedTopK,
    }));
    pythonProcess.stdin.end();
  });
}

async function ensureSession(sessionId, userId) {
  if (!isDbConnected()) {
    return {
      ph_ma: null,
      session_token: sessionId || `CHAT-${Date.now()}`,
      user_ma: toNumber(userId, 0) || null,
      nv_ma: null,
      ph_batdau: new Date().toISOString(),
      ph_da_chuyenchonv: 0,
      updated_at: new Date().toISOString(),
    };
  }

  const sessionsCollection = getCollection('chatbot_phienhoithoai');
  const numericUserId = toNumber(userId, 0) || null;

  if (sessionId) {
    const existing = await sessionsCollection.findOne({
      $or: [
        { session_token: sessionId },
        { sessionId },
        { id: sessionId },
      ],
    }).catch(() => null);
    if (existing) {
      const existingUserId = getSessionUserId(existing);
      if (numericUserId && !existingUserId) {
        await sessionsCollection.updateOne(
          { session_token: getSessionToken(existing) },
          { $set: { user_ma: numericUserId, updated_at: new Date().toISOString() } }
        ).catch(() => {});
        return {
          ...existing,
          user_ma: numericUserId,
        };
      }

      return existing;
    }
  }

  const nextId = await nextNumericId('chatbot_phienhoithoai', 'ph_ma');
  const token = sessionId || `CHAT-${Date.now()}`;
  const session = {
    ph_ma: nextId,
    session_token: token,
    user_ma: numericUserId,
    nv_ma: null,
    ph_batdau: new Date().toISOString(),
    ph_da_chuyenchonv: 0,
    updated_at: new Date().toISOString(),
  };

  await sessionsCollection.insertOne(session);
  return session;
}

async function storeMessage(sessionId, senderType, content, metadata = {}) {
  if (!isDbConnected()) {
    return {
      tn_ma: null,
      ph_ma: null,
      tn_nguoigui: senderType === 'bot' ? 0 : 1,
      tn_noidung: repairVietnameseText(content),
      recommendations: metadata.recommendations || [],
      extractedPreferences: metadata.extractedPreferences || null,
      quickReplies: metadata.quickReplies || [],
      resourceLinks: metadata.resourceLinks || [],
      orderInfo: metadata.orderInfo || null,
      created_at: new Date().toISOString(),
    };
  }

  const messagesCollection = getCollection('chatbot_tinnhan');
  const session = await getCollection('chatbot_phienhoithoai').findOne({
    $or: [
      { session_token: sessionId },
      { sessionId },
      { id: sessionId },
    ],
  });
  const nextId = await nextNumericId('chatbot_tinnhan', 'tn_ma');
  const document = {
    tn_ma: nextId,
    ph_ma: session?.ph_ma,
    tn_nguoigui: senderType === 'bot' ? 0 : 1,
    tn_noidung: repairVietnameseText(content),
    recommendations: metadata.recommendations || [],
    extractedPreferences: metadata.extractedPreferences || null,
    quickReplies: metadata.quickReplies || [],
    resourceLinks: metadata.resourceLinks || [],
    orderInfo: metadata.orderInfo || null,
    created_at: new Date().toISOString(),
  };

  await messagesCollection.insertOne(document);
  publishChatEvent({
    type: 'message-created',
    sessionId,
    ph_ma: session?.ph_ma || null,
    senderType,
  });
  await getCollection('chatbot_phienhoithoai').updateOne(
    { session_token: sessionId },
    { $set: { updated_at: new Date().toISOString() } }
  ).catch(() => {});

  return document;
}

async function loadSessionPayload(session) {
  const messages = await getCollection('chatbot_tinnhan')
    .find({
      $or: [
        { ph_ma: session.ph_ma },
        { ph_ma: String(session.ph_ma) },
        { sessionId: getSessionToken(session) },
      ],
    })
    .toArray()
    .catch(() => []);

  messages.sort((left, right) => getMessageSortValue(left) - getMessageSortValue(right));

  const isHumanAssigned = isHumanAssignedSession(session);

  return {
    sessionId: session.session_token,
    userId: getSessionUserId(session),
    isHumanAssigned,
    statusLabel: isHumanAssigned ? 'Đang trao đổi với nhân viên' : 'Chatbot AI',
    messages: messages.map((item) => ({
      id: item.tn_ma,
      sender: mapSenderType(item.tn_nguoigui),
      text: repairVietnameseText(item.tn_noidung),
      createdAt: item.created_at,
      recommendations: Array.isArray(item.recommendations) ? item.recommendations : [],
      quickReplies: Array.isArray(item.quickReplies) ? item.quickReplies : [],
      resourceLinks: Array.isArray(item.resourceLinks) ? item.resourceLinks : [],
      orderInfo: item.orderInfo || null,
      extractedPreferences: item.extractedPreferences || null,
    })),
  };
}

async function buildSessionSummary(session) {
  const payload = await loadSessionPayload(session);
  const messages = payload.messages || [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    id: session._id ? String(session._id) : session.session_token,
    sessionId: getSessionToken(session),
    ph_ma: session.ph_ma,
    userId: getSessionUserId(session),
    isHumanAssigned: isHumanAssignedSession(session),
    avatar: lastMessage?.sender === 'employee' ? '👩‍💼' : lastMessage?.sender === 'bot' ? 'AI' : '💬',
    title: `Phiên ${session.ph_ma}`,
    lastMessage: lastMessage?.text || '',
    lastMessageTime: lastMessage?.createdAt || session.updated_at || session.ph_batdau,
    statusLabel: isHumanAssignedSession(session) ? 'Đang trao đổi với nhân viên' : 'Chatbot AI',
    senderType: lastMessage?.sender || 'bot',
    messageCount: messages.length,
  };
}

router.get('/session', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Chatbot hiện chưa sẵn sàng vì cơ sở dữ liệu chưa kết nối.' });
    }

    const { sessionId, userId } = req.query;
    const humanOnly = req.query?.humanOnly === '1' || req.query?.humanOnly === 'true';
    const sessionsCollection = getCollection('chatbot_phienhoithoai');
    const numericUserId = toNumber(userId, 0) || null;
    let session = null;

    if (sessionId) {
      session = await sessionsCollection.findOne({
        $or: [
          { session_token: sessionId },
          { sessionId },
          { id: sessionId },
        ],
      }).catch(() => null);
      if (session && numericUserId) {
        const existingUserId = getSessionUserId(session);
        if (existingUserId && existingUserId !== numericUserId) {
          session = null;
        } else if (!existingUserId) {
          await sessionsCollection.updateOne(
            { session_token: getSessionToken(session) },
            { $set: { user_ma: numericUserId, updated_at: new Date().toISOString() } }
          ).catch(() => {});
          session = { ...session, user_ma: numericUserId };
        }
      }
      if (session && humanOnly && !isHumanAssignedSession(session)) {
        session = null;
      }

      // Widget chatbot AI không được tự phục hồi phiên đã chuyển cho nhân viên.
      if (session && !humanOnly && isHumanAssignedSession(session)) {
        session = null;
      }
    }

    if (!session && userId) {
      const baseUserMatch = {
        $or: [
          { user_ma: numericUserId },
          { userId: numericUserId },
          { user_ma: String(numericUserId) },
          { userId: String(numericUserId) },
        ],
      };
      const query = humanOnly
        ? { $and: [baseUserMatch, { $or: [{ ph_da_chuyenchonv: 1 }, { nv_ma: { $gt: 0 } }] }] }
        : { $and: [baseUserMatch, { $nor: [{ ph_da_chuyenchonv: 1 }, { nv_ma: { $gt: 0 } }] }] };
      session = await sessionsCollection.find(query).sort({ updated_at: -1, ph_batdau: -1 }).limit(1).next().catch(() => null);
    }

    if (!session) {
      return res.json({ sessionId: '', userId: numericUserId, messages: [] });
    }

    const payload = await loadSessionPayload(session);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/support-session', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Chatbot hiện chưa sẵn sàng vì cơ sở dữ liệu chưa kết nối.' });
    }

    const { userId } = req.body || {};
    const numericUserId = toNumber(userId, 0) || null;
    const sessionsCollection = getCollection('chatbot_phienhoithoai');
    const nextId = await nextNumericId('chatbot_phienhoithoai', 'ph_ma');
    const session = {
      ph_ma: nextId,
      session_token: `SUPPORT-${Date.now()}`,
      user_ma: numericUserId,
      nv_ma: null,
      ph_batdau: new Date().toISOString(),
      ph_da_chuyenchonv: 1,
      updated_at: new Date().toISOString(),
    };

    await sessionsCollection.insertOne(session);
    publishChatEvent({
      type: 'session-updated',
      sessionId: session.session_token,
      ph_ma: session.ph_ma,
      isHumanAssigned: true,
    });

    const payload = await loadSessionPayload(session);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/escalate', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'Chatbot hiện chưa sẵn sàng vì cơ sở dữ liệu chưa kết nối.' });
    }

    const { sessionId, userId } = req.body || {};
    const currentSession = await ensureSession(sessionId, userId);
    const currentToken = getSessionToken(currentSession);
    const numericUserId = toNumber(userId, 0) || getSessionUserId(currentSession) || null;

    await getCollection('chatbot_phienhoithoai').updateOne(
      { session_token: currentToken },
      {
        $set: {
          user_ma: numericUserId,
          ph_da_chuyenchonv: 1,
          updated_at: new Date().toISOString(),
        },
      }
    ).catch(() => {});

    publishChatEvent({
      type: 'session-updated',
      sessionId: currentToken,
      ph_ma: currentSession.ph_ma,
      isHumanAssigned: true,
    });

    res.json({ sessionId: currentToken, isHumanAssigned: true });
  } catch (error) {
    next(error);
  }
});

router.get('/sessions', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }

    const userId = toNumber(req.query?.userId, 0);
    if (!userId) {
      return res.json([]);
    }

    const fallbackSessionId = req.query?.sessionId ? String(req.query.sessionId) : '';

    let sessions = await getCollection('chatbot_phienhoithoai')
      .find({
        $or: [
          { user_ma: userId },
          { userId },
          { user_ma: String(userId) },
          { userId: String(userId) },
        ],
      })
      .sort({ updated_at: -1, ph_batdau: -1 })
      .toArray()
      .catch(() => []);

    if (sessions.length === 0 && fallbackSessionId) {
      const fallbackSession = await getCollection('chatbot_phienhoithoai').findOne({
        $or: [
          { session_token: fallbackSessionId },
          { sessionId: fallbackSessionId },
          { id: fallbackSessionId },
        ],
      }).catch(() => null);

      if (fallbackSession && isHumanAssignedSession(fallbackSession)) {
        const existingUserId = getSessionUserId(fallbackSession);
        if (!existingUserId || existingUserId === toNumber(userId, 0)) {
          if (!existingUserId) {
            await getCollection('chatbot_phienhoithoai').updateOne(
              { session_token: getSessionToken(fallbackSession) },
              { $set: { user_ma: toNumber(userId, 0) || null, updated_at: new Date().toISOString() } }
            ).catch(() => {});
          }

          sessions = [
            {
              ...fallbackSession,
              user_ma: toNumber(userId, 0) || fallbackSession.user_ma || null,
            },
          ];
        }
      }
    }

    // Chat hỗ trợ chỉ liệt kê các phiên đã chuyển cho nhân viên, không lẫn phiên Chatbot AI thuần túy.
    // Bỏ qua các bản ghi thiếu session_token (dữ liệu seed cũ không thể mở lại được).
    sessions = sessions.filter((session) => isHumanAssignedSession(session) && getSessionToken(session));

    const summaries = await Promise.all(sessions.map((session) => buildSessionSummary(session)));
    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

router.get('/stream', async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ message: 'Chatbot hiện chưa sẵn sàng vì cơ sở dữ liệu chưa kết nối.' });
  }

  const { sessionId, userId } = req.query;
  const sessionsCollection = getCollection('chatbot_phienhoithoai');
  let targetSession = null;

  if (sessionId) {
    targetSession = await sessionsCollection.findOne({
      $or: [
        { session_token: sessionId },
        { sessionId },
        { id: sessionId },
      ],
    }).catch(() => null);
  }

  if (!targetSession && userId) {
    const numericUserId = toNumber(userId, 0);
    targetSession = await sessionsCollection.find({
      $or: [
        { user_ma: numericUserId },
        { userId: numericUserId },
        { user_ma: String(numericUserId) },
        { userId: String(numericUserId) },
      ],
    }).sort({ updated_at: -1, ph_batdau: -1 }).limit(1).next().catch(() => null);
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  const unsubscribe = subscribeChatEvents((event) => {
    const eventSessionId = String(event.sessionId || event.session_token || event.ph_ma || '');
    const targetSessionId = String(targetSession?.session_token || targetSession?.ph_ma || sessionId || '');

    if (targetSessionId && eventSessionId && eventSessionId !== targetSessionId) {
      return;
    }

    if (!targetSessionId) {
      return;
    }

    res.write(`event: chat-event\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

router.post('/message', async (req, res, next) => {
  try {
    const { sessionId, userId, message, humanOnly } = req.body || {};
    const text = String(message || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Vui lòng nhập nội dung để chatbot tư vấn.' });
    }

    const session = await ensureSession(sessionId, userId);
    if (userId && session.user_ma && Number(session.user_ma) !== toNumber(userId, 0)) {
      return res.status(403).json({ message: 'Phiên chat này không thuộc tài khoản hiện tại.' });
    }

    const isHumanAssigned = isHumanAssignedSession(session);
    await storeMessage(session.session_token, 'user', text);

    if (shouldSkipBotReply(session, humanOnly)) {
      res.json({
        sessionId: session.session_token,
        message: null,
        mode: isHumanAssigned ? 'employee' : 'human-only',
      });
      return;
    }

    let replyText = '';
    let recommendations = [];
    let resourceLinks = [];
    let orderInfo = null;
    let preferences = null;
    const products = await loadProductDataset();
    const favoriteProductIds = await loadUserFavoriteIds(userId);
    const normalizedMessage = normalizeText(text);
    const isPopularityIntent = isPopularityQuestion(text);
    const isRatingIntent = isRatingQuestion(text);
    const isRecommendationIntent = isRecommendationRequest(text) || isPopularityIntent || isRatingIntent;
    const isSupportIntent = /(ho tro|tu van|don hang|don mua|voucher|ma giam|khuyen mai|huy don|chua nhan|giao tre|giao cham|thanh toan|tra hang|thue|thue game|muon thue|loi|su co|bao gio)/.test(normalizedMessage);
    const productInfoReply = isProductInfoQuestion(text, products)
      ? await buildFactualProductReply(text, products)
      : null;
    const supportReply = isSupportIntent ? await buildSupportReply(text, userId) : null;
    const ruleReply = looksLikeRuleQuestion(text) ? findRuleGuide(normalizeText(text), products) : null;
    const faqReply = buildFaqReply(text);

    if (isSupportIntent && supportReply) {
      replyText = supportReply.reply;
      resourceLinks = supportReply.resourceLinks || [];
      orderInfo = supportReply.orderInfo || null;
    } else if (ruleReply) {
      replyText = ruleReply.reply;
      resourceLinks = ruleReply.resourceLinks || [];
    } else if (productInfoReply) {
      replyText = productInfoReply.reply;
      recommendations = productInfoReply.recommendations || [];
    } else if (isRecommendationIntent) {
      try {
        const pythonReply = await runPythonChatbot(text, products, 20);
        replyText = pythonReply.reply || '';
        preferences = normalizePreferencesFromPython(pythonReply.preferences) || null;

        const knnRecommendations = Array.isArray(pythonReply.recommendations) ? pythonReply.recommendations : [];
        const hydrated = hydrateKnnRecommendations(knnRecommendations, products);
        const candidateRecommendations = filterKnnRecommendations(hydrated, preferences);

        if (!candidateRecommendations || candidateRecommendations.length === 0) {
          const prefSummary = buildPreferenceSummary(preferences);
          replyText = `Hiện chưa có sản phẩm nào phù hợp với tất cả yêu cầu của bạn${prefSummary ? `: ${prefSummary}` : ''}.`;
          resourceLinks = [
            createResourceLink('Chat hỗ trợ', '/support', 'Liên hệ nhân viên hỗ trợ để được tư vấn chính xác nhất.'),
          ];
          recommendations = [];
        } else {
          let rankedRecommendations = candidateRecommendations;

          if (isPopularityIntent) {
            const salesMap = await loadSalesCounts();
            const rankedBySales = [...products]
              .filter((product) => salesMap.has(toNumber(product.id, 0)))
              .sort((left, right) => (salesMap.get(toNumber(right.id, 0)) || 0) - (salesMap.get(toNumber(left.id, 0)) || 0));

            if (rankedBySales.length > 0) {
              const bestSeller = rankedBySales[0];
              const bestSellerId = toNumber(bestSeller.id, 0);
              const rank = rankedBySales.findIndex((product) => toNumber(product.id, 0) === bestSellerId) + 1;
              const salesCount = salesMap.get(bestSellerId) || 0;
              replyText = `Game phổ biến nhất hiện nay là ${bestSeller.name}, với ${salesCount} lượt mua, đang xếp hạng ${rank} trong danh sách Best Seller.`;
            } else {
              replyText = 'Hiện chưa có dữ liệu lượt mua thực tế để xác định game phổ biến nhất.';
            }
            recommendations = rankedRecommendations.slice(0, 5);
          } else if (isRatingIntent) {
            rankedRecommendations = sortRecommendationsByRating(candidateRecommendations);
            replyText = `Game được đánh giá cao nhất phù hợp với yêu cầu của bạn hiện tại là ${rankedRecommendations[0].name}.`;
          } else {
            rankedRecommendations = sortRecommendationsByFavorites(candidateRecommendations, favoriteProductIds);
            const prefSummary = buildPreferenceSummary(preferences);
            if (rankedRecommendations.length < 5) {
              replyText = `Mình tìm được ${rankedRecommendations.length} game phù hợp với yêu cầu của bạn: ${prefSummary || 'theo tiêu chí bạn cung cấp'}.`;
            } else {
              replyText = prefSummary
                ? `Mình đã hiểu nhu cầu của bạn: ${prefSummary}. Dựa trên các tiêu chí này, mình đề xuất các game phù hợp nhất trong Top 5.`
                : 'Mình đề xuất các game phù hợp nhất trong Top 5 cho bạn.';
            }

            const favoriteNames = rankedRecommendations.filter((item) => isFavoriteProduct(item, favoriteProductIds)).map((item) => item.name);
            const favoritePrioritySentence = buildFavoritePrioritySentence(favoriteNames);
            if (favoritePrioritySentence) {
              replyText = `${replyText} ${favoritePrioritySentence}`;
            }
          }

          recommendations = rankedRecommendations.slice(0, 5);
        }
      } catch (pythonError) {
        console.error('[chatbot] KNN recommendation failed:', pythonError);
        replyText = 'Mình chưa thể hoàn tất gợi ý bằng mô hình KNN từ board_games.csv. Vui lòng thử lại sau.';
        recommendations = [];
      }
    } else if (faqReply) {
      replyText = faqReply;
    } else {
      replyText = 'Mình chưa tìm được thông tin phù hợp với yêu cầu của bạn. Vui lòng mô tả rõ hơn hoặc liên hệ nhân viên hỗ trợ để được tư vấn chính xác nhất qua Chat hỗ trợ.';
      resourceLinks = [
        createResourceLink('Chat hỗ trợ', '/support', 'Liên hệ nhân viên hỗ trợ để được tư vấn chính xác nhất.'),
      ];
    }

    const hydratedRecommendations = recommendations.map((item) => ({
      id: item.id,
      name: item.name,
      image: item.image,
      price: item.currentPrice ?? item.price,
      originalPrice: item.originalPrice ?? item.price,
      currentPrice: item.currentPrice ?? item.price,
      discount: item.discount,
      rentalPrice: item.rentalPrice,
      category: item.category,
      players: item.players,
      age: item.age,
      playTime: item.playTime,
      rating: item.rating,
      reviews: item.reviews,
      stock: item.stock,
      reasons: item.reasons || [],
    }));

    const quickReplies = buildQuickReplies();
    const botMessage = await storeMessage(session.session_token, 'bot', replyText, {
      recommendations: hydratedRecommendations,
      extractedPreferences: preferences,
      quickReplies,
      resourceLinks,
      orderInfo,
    });

    res.json({
      sessionId: session.session_token,
      message: {
        id: botMessage.tn_ma,
        sender: 'bot',
        text: replyText,
        createdAt: botMessage.created_at,
        recommendations: hydratedRecommendations,
        quickReplies,
        extractedPreferences: preferences,
        resourceLinks,
        orderInfo,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.shouldSkipBotReply = shouldSkipBotReply;
module.exports.isHumanAssignedSession = isHumanAssignedSession;