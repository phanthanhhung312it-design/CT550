import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getAuthToken, getAuthUser, isAuthenticated, clearAuthUser } from './auth';
import { products as fallbackProducts, orders as fallbackOrders, rentalOrders as fallbackRentalOrders, reviews as fallbackReviews } from './boardgameData';
import BlogManager from './BlogManager';
import ChatSupportManager from './ChatSupportManager';
import '../css/Admin.css';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

const adminSections = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'products', label: 'Quản lý sản phẩm' },
  { key: 'purchase_receipts', label: 'Quản lý nhập kho' },
  { key: 'categories', label: 'Quản lý danh mục' },
  { key: 'brands', label: 'Quản lý thương hiệu' },
  { key: 'orders', label: 'Quản lý đơn hàng' },
  { key: 'rentals', label: 'Quản lý đơn thuê' },
  { key: 'customers', label: 'Quản lý khách hàng' },
  { key: 'reviews', label: 'Quản lý đánh giá' },
  { key: 'promotions', label: 'Quản lý khuyến mãi' },
  { key: 'reports', label: 'Thống kê báo cáo' },
  { key: 'content_pages', label: 'Quản lý nội dung blog' },
  { key: 'chat_messages', label: 'Chat hỗ trợ' },
];

const collectionConfigs = {
  categories: {
    title: 'Danh mục',
    fields: [
      { name: 'name', label: 'Tên danh mục', type: 'text', placeholder: 'Chiến thuật' },
      { name: 'slug', label: 'Slug', type: 'text', placeholder: 'chien-thuat' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: ['Hoạt động', 'Tạm khóa'] },
    ],
  },
  brands: {
    title: 'Thương hiệu',
    fields: [
      { name: 'name', label: 'Tên nhà xuất bản', type: 'text', placeholder: 'Asmodee' },
      { name: 'country', label: 'Quốc gia', type: 'text', placeholder: 'Pháp' },
      { name: 'website', label: 'Website', type: 'text', placeholder: 'https://asmodee.com' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: ['Hoạt động', 'Tạm khóa'] },
    ],
  },
  employees: {
    title: 'Nhân viên',
    fields: [
      { name: 'fullName', label: 'Họ và tên', type: 'text', placeholder: 'Nguyễn Văn An' },
      { name: 'email', label: 'Email', type: 'text', placeholder: 'an@boardgame.vn' },
      { name: 'password', label: 'Mật khẩu', type: 'text', placeholder: 'Nhập mật khẩu' },
      { name: 'gender', label: 'Giới tính', type: 'number', placeholder: '1' },
      { name: 'birthDate', label: 'Ngày sinh', type: 'date' },
      { name: 'address', label: 'Địa chỉ', type: 'text', placeholder: 'Quận 3, TP. Hồ Chí Minh' },
      { name: 'phone', label: 'Số điện thoại', type: 'text', placeholder: '0912000001' },
      { name: 'avatar', label: 'Avatar', type: 'text', placeholder: '/image/staff-an.jpg' },
      { name: 'role', label: 'Quyền', type: 'text', placeholder: 'staff' },
      { name: 'status', label: 'Trạng thái', type: 'text', placeholder: 'active' },
    ],
  },
  reviews: {
    title: 'Đánh giá',
    fields: [
      { name: 'productName', label: 'Sản phẩm', type: 'text', placeholder: 'Catan' },
      { name: 'author', label: 'Người đánh giá', type: 'text', placeholder: 'Nguyễn An' },
      { name: 'rating', label: 'Điểm', type: 'number', placeholder: '5' },
      { name: 'content', label: 'Nội dung', type: 'textarea', placeholder: 'Đánh giá hiển thị trên trang chi tiết sản phẩm.' },
      { name: 'status', label: 'Trạng thái', type: 'text', placeholder: 'approved' },
    ],
  },
  promotions: {
    title: 'Khuyến mãi',
    fields: [
      { name: 'title', label: 'Tên chương trình', type: 'text', placeholder: 'Flash sale cuối tuần' },
      { name: 'discount', label: 'Giảm giá (%)', type: 'number', placeholder: '15' },
      { name: 'startDate', label: 'Bắt đầu', type: 'date' },
      { name: 'endDate', label: 'Kết thúc', type: 'date' },
    ],
  },
  content_pages: {
    title: 'Nội dung website',
    fields: [
      { name: 'title', label: 'Tiêu đề', type: 'text', placeholder: 'Banner quảng cáo' },
      { name: 'type', label: 'Loại nội dung', type: 'text', placeholder: 'banner' },
      { name: 'content', label: 'Nội dung', type: 'textarea', placeholder: 'Nội dung hiển thị trên website' },
    ],
  },
  chat_messages: {
    title: 'Chat hỗ trợ',
    fields: [
      { name: 'customerName', label: 'Khách hàng', type: 'text', placeholder: 'Hung Phan' },
      { name: 'message', label: 'Tin nhắn', type: 'textarea', placeholder: 'Nội dung trao đổi với khách hàng' },
      { name: 'status', label: 'Trạng thái', type: 'text', placeholder: 'open' },
    ],
  },
};

const productInitialState = {
  id: '',
  name: '',
  category: 'Chiến lược',
  brand: '',
  publisher: '',
  stock: '0',
  players: '',
  age: '',
  playTime: '',
  price: '',
  discount: '0',
  rating: '0',
  reviews: '0',
  image: '',
  labels: '',
  description: '',
};

const voucherInitialState = {
  title: '',
  code: '',
  scope: 'public',
  description: '',
  discountType: 2,
  value: '',
  maxDiscount: '',
  minAmount: '',
  startDate: '',
  endDate: '',
  quantity: '',
  maxUsesPerCustomer: 1,
  status: 'active',
};

const demoEmployeeProfiles = [
  {
    id: 1,
    fullName: 'Nguyễn Văn An',
    email: 'an@boardgame.vn',
    password: '',
    gender: 1,
    birthDate: '1994-03-12',
    address: 'Quận 3, TP. Hồ Chí Minh',
    phone: '0912000001',
    avatar: '/image/staff-an.jpg',
    role: 'admin',
    status: 'active',
  },
  {
    id: 2,
    fullName: 'Trần Thị Mai',
    email: 'mai@boardgame.vn',
    password: '',
    gender: 0,
    birthDate: '1998-08-21',
    address: 'Quận 10, TP. Hồ Chí Minh',
    phone: '0912000002',
    avatar: '/image/staff-mai.jpg',
    role: 'staff',
    status: 'active',
  },
];

const orderStatusOptions = ['Tất cả', 'Chờ xác nhận', 'Đang xử lý', 'Đang giao', 'Hoàn thành', 'Đã hủy'];
const rentalStatusOptions = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Đang thuê', 'Chờ trả hàng', 'Đã trả hàng', 'Hoàn thành', 'Đã hủy'];
const rentalPaymentStatusOptions = ['Chưa thanh toán', 'Đã thanh toán', 'Đã hoàn cọc', 'Hoàn cọc một phần'];
const reviewStatusOptions = ['Tất cả', 'Chờ duyệt', 'Hiển thị', 'Ẩn'];
const reportPresets = [
  { value: 'all', label: 'Tất cả dữ liệu' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
  { value: 'custom', label: 'Tùy chọn' },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildOrderTimeline(statusLabel) {
  const normalized = normalizeText(statusLabel);

  if (normalized.includes('huy')) {
    return [
      { key: 'placed', label: 'Đã đặt hàng', state: 'completed' },
      { key: 'cancelled', label: 'Đã hủy', state: 'current' },
    ];
  }

  const steps = ['Đã đặt hàng', 'Đã xác nhận', 'Đang xử lý', 'Đang giao', 'Hoàn thành'];
  let currentStep = 0;

  if (normalized.includes('hoan thanh')) {
    currentStep = 4;
  } else if (normalized.includes('giao')) {
    currentStep = 3;
  } else if (normalized.includes('xu ly')) {
    currentStep = 2;
  } else if (normalized.includes('xac nhan')) {
    currentStep = 1;
  }

  return steps.map((label, index) => ({
    key: label,
    label,
    state: index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming',
  }));
}

function formatVoucherValue(voucher) {
  const discountType = Number(voucher?.discountType || voucher?.vc_loaigiamgia || 2);
  const value = Number(voucher?.value || voucher?.vc_giatri || 0);
  const maxDiscount = Number(voucher?.maxDiscount || voucher?.vc_giamtoida || 0);

  if (discountType === 1) {
    return `Giảm ${value}%${maxDiscount > 0 ? ` (tối đa ${formatMoney(maxDiscount)})` : ''}`;
  }

  return `Giảm ${formatMoney(value)}`;
}

function getVoucherScopeLabel(scope) {
  return normalizeText(scope).includes('private') ? 'Riêng tư' : 'Công khai';
}

function isHumanAssignedChatSession(session) {
  return Number(session?.ph_da_chuyenchonv) === 1 || Number(session?.nv_ma || 0) > 0;
}

function getChatSessionCustomerName(session, usersById) {
  const customer = usersById.get(String(session?.user_ma || session?.userId));
  return getPersonName(customer) || `Khách hàng #${session?.user_ma || session?.userId || '-'}`;
}

function getVoucherStatusLabel(status) {
  const normalized = normalizeText(status || 'active');
  if (normalized.includes('expired')) {
    return 'Hết hạn';
  }
  if (normalized.includes('locked')) {
    return 'Đã khóa';
  }
  if (normalized.includes('scheduled')) {
    return 'Sắp diễn ra';
  }
  if (normalized.includes('out_of_stock')) {
    return 'Hết lượt';
  }
  return 'Đang hoạt động';
}

function toManagedVoucherShape(item = {}, source = 'voucher') {
  const code = String(item.code || item.vc_code || item.promoCode || '').trim().toUpperCase();
  const title = String(item.title || item.vc_ten || item.name || item.promoName || code || 'Voucher').trim();
  const scope = String(item.scope || item.vc_scope || item.type || 'public').toLowerCase().includes('private') ? 'private' : 'public';
  const discountType = Number(item.discountType || item.typeDiscount || item.vc_loaigiamgia || (Number(item.discount || 0) > 0 ? 1 : 2)) === 1 ? 1 : 2;
  const value = Number(item.value || item.vc_giatri || item.discountValue || item.discount || 0);
  const maxDiscount = Number(item.maxDiscount || item.vc_giamtoida || 0);
  const minAmount = Number(item.minAmount || item.vc_dieukien_toithieu || item.minimumOrder || 0);
  const quantity = Number(item.quantity || item.vc_soluong || item.totalCount || 0);
  const usedCount = Number(item.usedCount || item.vc_dasudung || item.used || 0);
  const rawId = item._id || item.id || item.vc_ma || '';

  return {
    id: item.id || item.vc_ma || item._id || `${source}-${code || Math.random().toString(36).slice(2, 10)}`,
    rawId,
    source,
    code,
    title,
    description: String(item.description || item.vc_mota || '').trim(),
    scope,
    discountType,
    value,
    maxDiscount,
    minAmount,
    startDate: item.startDate || item.vc_ngaybatdau || item.createdAt || null,
    endDate: item.endDate || item.vc_ngayketthuc || null,
    quantity,
    usedCount,
    remainingQuantity: quantity > 0 ? Math.max(0, quantity - usedCount) : null,
    maxUsesPerCustomer: Number(item.maxUsesPerCustomer || item.vc_solan_sudung_toi_da || 1),
    status: String(item.status || item.vc_trangthai || 'active'),
    assignedCustomerCount: Number(item.assignedCustomerCount || 0),
    assignedCustomers: Array.isArray(item.assignedCustomers) ? item.assignedCustomers : [],
  };
}

function mergeVoucherSources(primary = [], legacyVoucherCollection = [], legacyPromotions = [], rentalOptionVouchers = []) {
  const merged = [
    ...(Array.isArray(primary) ? primary.map((item) => toManagedVoucherShape(item, 'voucher')) : []),
    ...(Array.isArray(legacyVoucherCollection) ? legacyVoucherCollection.map((item) => toManagedVoucherShape(item, 'legacy_voucher')) : []),
    ...(Array.isArray(legacyPromotions) ? legacyPromotions.map((item) => toManagedVoucherShape(item, 'promotion')) : []),
    ...(Array.isArray(rentalOptionVouchers) ? rentalOptionVouchers.map((item) => toManagedVoucherShape(item, 'rental')) : []),
  ];

  const byCode = new Map();
  merged.forEach((item) => {
    const key = item.code || String(item.id);
    if (!key) {
      return;
    }

    if (!byCode.has(key)) {
      byCode.set(key, item);
      return;
    }

    const current = byCode.get(key);
    byCode.set(key, {
      ...item,
      ...current,
      id: current.id || item.id,
      code: current.code || item.code,
      title: current.title || item.title,
      description: current.description || item.description,
      scope: current.scope || item.scope,
    });
  });

  return [...byCode.values()];
}

function mapCustomersFromUsers(users = []) {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map((user) => ({
    id: user.id,
    fullName: user.displayName || user.fullName || user.username || user.email || `Khách hàng #${user.id}`,
    email: user.email || '',
    phone: user.phone || '',
  }));
}

function getPersonName(person) {
  return person?.displayName || person?.fullName || person?.username || person?.name || person?.email || '-';
}

function getOrderCustomer(order) {
  return order?.customerName || order?.displayName || order?.fullName || order?.userName || order?.username || `Khách hàng #${order?.user_ma || order?.userId || '-'}`;
}

function getOrderPayment(order) {
  if (order?.paymentMethod) {
    return order.paymentMethod;
  }

  if (order?.tt_ma === 2) {
    return 'MOMO';
  }

  if (order?.tt_ma === 3) {
    return 'VNPay';
  }

  return order?.tt_ma === 1 ? 'COD' : 'Chưa xác định';
}

function getOrderShipping(order) {
  return order?.shippingMethod || order?.shippingProvider || order?.shipping || (order?.vc_ma ? `ĐVVC #${order.vc_ma}` : 'Chưa xác định');
}

function getCustomerStatusLabel(customer) {
  return customer?.isLocked ? 'Đang khóa' : 'Hoạt động';
}

function getEmployeeStatusLabel(employee) {
  return normalizeText(employee?.status) === 'active' ? 'Hoạt động' : 'Tạm khóa';
}

function getCollectionStatusLabel(item) {
  const value = item?.status ?? item?.statusLabel ?? item?.trangthai ?? item?.loai_trangthai ?? item?.state;
  const normalized = normalizeText(value);

  if (!value) {
    return 'Hoạt động';
  }

  if (
    normalized.includes('hoat dong')
    || normalized.includes('dang hoat dong')
    || normalized.includes('active')
    || normalized === '1'
    || normalized === 'true'
    || normalized === 'enabled'
  ) {
    return 'Hoạt động';
  }

  if (
    normalized.includes('tam khoa')
    || normalized.includes('khoa')
    || normalized.includes('locked')
    || normalized.includes('inactive')
    || normalized.includes('disabled')
    || normalized === '0'
    || normalized === 'false'
  ) {
    return 'Tạm khóa';
  }

  return value ? String(value) : 'Hoạt động';
}

function getCategoryProductCount(categoryName, productsList) {
  const normalizedCategory = normalizeText(categoryName);

  return productsList.filter((product) => normalizeText(product.category) === normalizedCategory).length;
}

function matchesCategoryProduct(product, category) {
  if (!product || !category) {
    return false;
  }

  const categoryKeys = [
    category.id,
    category._id,
    category.loai_ma,
    category.slug,
    category.loai_slug,
    category.name,
    category.title,
    category.loai_ten,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const productKeys = [
    product.categoryId,
    product.loai_ma,
    product.categorySlug,
    product.category,
    product.loai_ten,
    product.categoryName,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return categoryKeys.some((categoryKey) => (
    productKeys.some((productKey) => normalizeText(productKey) === normalizeText(categoryKey))
  ));
}

function matchesBrandProduct(product, brand) {
  if (!product || !brand) {
    return false;
  }

  const brandKeys = [
    brand.id,
    brand._id,
    brand.nxb_ma,
    brand.slug,
    brand.nxb_slug,
    brand.name,
    brand.title,
    brand.nxb_ten,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const productKeys = [
    product.brandId,
    product.nxb_ma,
    product.brandSlug,
    product.brand,
    product.publisher,
    product.nxb_ten,
    product.brandName,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return brandKeys.some((brandKey) => productKeys.some((productKey) => normalizeText(productKey) === normalizeText(brandKey)));
}

function getBrandProductCount(brandName, productsList) {
  const normalizedBrand = normalizeText(brandName);

  return productsList.filter((product) => normalizeText(product.brand) === normalizedBrand || normalizeText(product.publisher) === normalizedBrand).length;
}

const genericInitialState = Object.keys(collectionConfigs).reduce((state, key) => {
  state[key] = collectionConfigs[key].fields.reduce((fields, field) => {
    fields[field.name] = '';
    return fields;
  }, {});
  return state;
}, {});

function toLabelsString(labels) {
  if (Array.isArray(labels)) {
    return labels.join(', ');
  }

  return labels || '';
}

function getFallbackSummaryData() {
  return {
    products: fallbackProducts.length,
    customers: 0,
    employees: 0,
    orders: fallbackOrders.length,
    rentals: fallbackRentalOrders.length,
    categories: 0,
    brands: 0,
    promotions: 0,
    reviews: 0,
    content_pages: 0,
    chat_messages: 0,
    orderStatus: fallbackOrders.reduce((items, order) => {
      const existingItem = items.find((item) => item._id === order.status);
      if (existingItem) {
        existingItem.count += 1;
      } else {
        items.push({ _id: order.status, count: 1 });
      }
      return items;
    }, []),
    revenue: 0,
  };
}

function toDateInputValue(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function getReportRange(preset, cursorDate, startDate, endDate) {
  const current = cursorDate instanceof Date && !Number.isNaN(cursorDate.getTime()) ? new Date(cursorDate) : new Date();

  if (preset === 'custom') {
    const from = new Date(startDate || toDateInputValue(new Date(current.getFullYear(), current.getMonth(), 1)));
    const to = new Date(endDate || toDateInputValue(new Date()));
    return {
      preset: 'custom',
      from: new Date(from.getFullYear(), from.getMonth(), from.getDate()),
      to: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
    };
  }

  if (preset === 'all') {
    return {
      preset: 'all',
      from: new Date(2000, 0, 1, 0, 0, 0, 0),
      to: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59, 999),
    };
  }

  if (preset === 'today' || preset === 'day') {
    return {
      preset: 'day',
      from: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0, 0),
      to: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999),
    };
  }

  if (preset === 'week') {
    const from = new Date(current);
    const weekday = from.getDay() || 7;
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - weekday + 1);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { preset: 'week', from, to };
  }

  if (preset === 'month') {
    const from = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
    return { preset: 'month', from, to };
  }

  if (preset === 'year') {
    const from = new Date(current.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(current.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { preset: 'year', from, to };
  }

  return getReportRange('month', current, startDate, endDate);
}

function formatRangeLabel(preset, range) {
  const formatDay = (value) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);

  if (preset === 'all') {
    return 'Tất cả dữ liệu';
  }

  if (preset === 'day') {
    return `Ngày: ${formatDay(range.from)}`;
  }

  if (preset === 'week') {
    return `Tuần: ${formatDay(range.from)} - ${formatDay(range.to)}`;
  }

  if (preset === 'year') {
    return `Năm: ${range.from.getFullYear()}`;
  }

  if (preset === 'custom') {
    return `Tùy chọn: ${formatDay(range.from)} - ${formatDay(range.to)}`;
  }

  return `Tháng: ${String(range.from.getMonth() + 1).padStart(2, '0')}/${range.from.getFullYear()}`;
}

function Admin() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const hasAuthUser = Boolean(authUser);
  const authRole = (authUser?.role || '').toLowerCase();
  const isAdmin = authRole === 'admin';
  const isEmployee = authRole === 'employee';
  const canAccessAdminPanel = isAdmin || isEmployee;
  const availableSections = isAdmin ? adminSections : adminSections.filter((section) => section.key === 'promotions');
  const token = getAuthToken();
  const [activeSection, setActiveSection] = useState(isAdmin ? 'dashboard' : 'promotions');
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [reviewsData, setReviewsData] = useState([]);
  const [users, setUsers] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [collections, setCollections] = useState({});
  const [productForm, setProductForm] = useState(productInitialState);
  const [editingProductId, setEditingProductId] = useState(null);
  const [genericForms, setGenericForms] = useState(genericInitialState);
  const [editingCollection, setEditingCollection] = useState(null);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('Tất cả');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [rentalQuery, setRentalQuery] = useState('');
  const [rentalStatusFilter, setRentalStatusFilter] = useState('Tất cả');
  const [selectedRentalId, setSelectedRentalId] = useState('');
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState('Tất cả');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('Tất cả');
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('Tất cả');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [resetPasswordForId, setResetPasswordForId] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('Tất cả');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [reportPreset, setReportPreset] = useState('month');
  const [reportStartDate, setReportStartDate] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [reportEndDate, setReportEndDate] = useState(toDateInputValue(new Date()));
  const [reportDateCursor, setReportDateCursor] = useState(new Date());
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [managedVouchers, setManagedVouchers] = useState([]);
  const [purchaseReceipts, setPurchaseReceipts] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState('all');
  const [purchaseDateFilter, setPurchaseDateFilter] = useState('all');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', date: new Date().toISOString().slice(0, 10), note: '', items: [] });
  const [purchaseSearchProducts, setPurchaseSearchProducts] = useState('');
  const [voucherCustomers, setVoucherCustomers] = useState([]);
  const [voucherQuery, setVoucherQuery] = useState('');
  const [voucherStatusFilter, setVoucherStatusFilter] = useState('all');
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('all');
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [voucherCustomerQuery] = useState('');
  const [voucherForm, setVoucherForm] = useState(voucherInitialState);
  const [editingVoucherId, setEditingVoucherId] = useState('');
  const [selectedVoucherCustomers, setSelectedVoucherCustomers] = useState([]);
  const [voucherLimitCustomers, setVoucherLimitCustomers] = useState('0');
  const [voucherMaxUsesPerCustomer, setVoucherMaxUsesPerCustomer] = useState('1');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const collectionKeys = useMemo(() => Object.keys(collectionConfigs).filter((key) => key !== 'reviews' && key !== 'promotions'), []);

  const getPurchaseSupplierName = (supplierId) => {
    const normalizedId = String(supplierId ?? '').trim();
    if (!normalizedId || normalizedId === 'undefined' || normalizedId === 'null') {
      return 'Everjoy Publishing';
    }

    const supplier = Array.isArray(supplierOptions)
      ? supplierOptions.find((item) => String(item.ncc_ma ?? item.id) === String(supplierId))
      : null;

    return supplier?.ncc_ten || supplier?.name || 'Everjoy Publishing';
  };

  const filteredVoucherRows = useMemo(() => {
    const query = normalizeText(voucherQuery);

    return managedVouchers.filter((voucher) => {
      const matchesQuery = !query || normalizeText([voucher.code, voucher.title, voucher.description].join(' ')).includes(query);
      const matchesStatus = voucherStatusFilter === 'all' || String(voucher.status) === String(voucherStatusFilter);
      const matchesType = voucherTypeFilter === 'all' || String(voucher.scope) === String(voucherTypeFilter);
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [managedVouchers, voucherQuery, voucherStatusFilter, voucherTypeFilter]);

  const selectedVoucher = useMemo(() => {
    if (!filteredVoucherRows.length) {
      return null;
    }

    return filteredVoucherRows.find((voucher) => String(voucher.id) === String(selectedVoucherId)) || filteredVoucherRows[0];
  }, [filteredVoucherRows, selectedVoucherId]);

  const filteredPurchaseReceipts = useMemo(() => {
    const query = normalizeText(purchaseQuery);

    return purchaseReceipts.filter((receipt) => {
      const matchesQuery = !query || normalizeText([receipt.code, receipt.supplierName, receipt.employeeName, receipt.note].join(' ')).includes(query);
      const matchesSupplier = purchaseSupplierFilter === 'all' || String(receipt.supplierId) === String(purchaseSupplierFilter);
      const matchesDate = purchaseDateFilter === 'all' || (() => {
        const date = new Date(receipt.receivedAt || receipt.createdAt || new Date());
        if (Number.isNaN(date.getTime())) {
          return false;
        }
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthKey === purchaseDateFilter;
      })();

      return matchesQuery && matchesSupplier && matchesDate;
    });
  }, [purchaseDateFilter, purchaseQuery, purchaseReceipts, purchaseSupplierFilter]);

  const selectedPurchase = useMemo(() => {
    if (!filteredPurchaseReceipts.length) {
      return null;
    }

    return filteredPurchaseReceipts.find((receipt) => String(receipt.id) === String(selectedPurchaseId)) || filteredPurchaseReceipts[0];
  }, [filteredPurchaseReceipts, selectedPurchaseId]);

  const purchaseProductOptions = useMemo(() => {
    const source = Array.isArray(products) && products.length > 0 ? products : fallbackProducts;
    return source.filter((product) => {
      const key = String(product.id || product.sp_ma || '');
      const query = normalizeText(purchaseSearchProducts);
      const matchesQuery = !query || normalizeText([product.name, product.category, product.brand, product.publisher].join(' ')).includes(query);
      return Boolean(key) && matchesQuery && !purchaseForm.items.some((item) => String(item.productId) === String(product.id || product.sp_ma));
    });
  }, [products, purchaseForm.items, purchaseSearchProducts]);

  const filteredVoucherCustomers = useMemo(() => {
    const query = normalizeText(voucherCustomerQuery);
    return voucherCustomers.filter((customer) => !query || normalizeText([customer.fullName, customer.email, customer.phone, customer.id].join(' ')).includes(query));
  }, [voucherCustomerQuery, voucherCustomers]);

  const orderRows = useMemo(() => {
    const source = Array.isArray(orders) && orders.length > 0 ? orders : fallbackOrders;

    return source.map((order, index) => ({
      ...order,
      id: order.orderNumber || order.id || `ORDER-${index + 1}`,
      customerName: getOrderCustomer(order),
      paymentLabel: getOrderPayment(order),
      shippingLabel: getOrderShipping(order),
      statusLabel: order.status || 'Chờ xác nhận',
      totalLabel: formatMoney(order.total || order.totalAmount || order.dh_thanhtien || order.amount || 0),
      detailItems: Array.isArray(order.items) && order.items.length > 0 ? order.items : fallbackProducts.slice(0, 3).map((product) => ({
        name: product.name,
        quantity: 1,
        price: product.price,
      })),
    }));
  }, [orders]);

  const featuredProducts = useMemo(() => {
    const source = Array.isArray(products) && products.length > 0 ? products : fallbackProducts;

    return [...source]
      .sort((left, right) => (
        (Number(right.soldQuantity || 0) - Number(left.soldQuantity || 0))
        || (Number(right.averageRating || right.rating || 0) - Number(left.averageRating || left.rating || 0))
        || (Number(right.reviews || right.reviewCount || 0) - Number(left.reviews || left.reviewCount || 0))
        || String(left.name || '').localeCompare(String(right.name || ''))
      ))
      .slice(0, 4)
      .map((product, index) => ({
        id: product.id || product.productId || `FEATURED-${index + 1}`,
        name: product.name || `Sản phẩm ${index + 1}`,
        soldLabel: Number(product.soldQuantity || product.sold || 0),
        stockLabel: Number(product.stock || 0),
        ratingLabel: Number(product.averageRating || product.rating || 0).toFixed(1),
      }));
  }, [products]);

  const recentOrders = useMemo(() => orderRows.slice(0, 4), [orderRows]);

  const rentalRows = useMemo(() => {
    const source = Array.isArray(rentals) && rentals.length > 0 ? rentals : fallbackRentalOrders;

    return source.map((rental, index) => ({
      ...rental,
      rentalKey: rental.id || rental.dt_ma || index + 1,
      id: rental.rentalNumber || rental.id || `RENTAL-${index + 1}`,
      rentalNumber: rental.rentalNumber || `DT-${String(rental.id || index + 1).padStart(5, '0')}`,
      customerName: rental.customerName || getOrderCustomer(rental),
      receiveDate: rental.receiveDate || rental.dt_ngaybatdauthue || '-',
      returnDate: rental.returnDate || rental.dt_ngayphailai || '-',
      paymentLabel: rental.paymentMethod || getOrderPayment(rental),
      shippingLabel: rental.shippingUnit || getOrderShipping(rental),
      paymentStatusLabel: rental.paymentStatus || rental.dt_trangthaithanhtoan || 'Chưa thanh toán',
      statusLabel: rental.status || rental.dt_trangthai || 'Chờ xác nhận',
      depositLabel: formatMoney(rental.totalDeposit || rental.dt_tongtiencoc || 0),
      totalLabel: formatMoney(rental.totalAmount || rental.dt_tongthanhtoan || 0),
      detailItems: Array.isArray(rental.items) && rental.items.length > 0
        ? rental.items
        : fallbackProducts.slice(0, 2).map((product) => ({
          name: product.name,
          quantity: 1,
          rentalDays: 3,
          rentalPricePerDay: Math.round((product.price || 0) * 0.1),
          depositPerItem: Math.round((product.price || 0) * 0.35),
        })),
    }));
  }, [rentals]);

    const recentRentals = useMemo(() => rentalRows.slice(0, 4), [rentalRows]);

  const filteredRentalRows = useMemo(() => {
    const query = normalizeText(rentalQuery);

    return rentalRows.filter((rental) => {
      const matchesQuery = !query || normalizeText([
        rental.rentalNumber,
        rental.customerName,
        rental.customerPhone,
      ].join(' ')).includes(query);
      const matchesStatus = rentalStatusFilter === 'Tất cả' || normalizeText(rental.statusLabel) === normalizeText(rentalStatusFilter);

      return matchesQuery && matchesStatus;
    });
  }, [rentalQuery, rentalRows, rentalStatusFilter]);

  const selectedRental = useMemo(() => {
    if (!filteredRentalRows.length) {
      return null;
    }

    return filteredRentalRows.find((rental) => String(rental.id) === String(selectedRentalId)) || filteredRentalRows[0];
  }, [filteredRentalRows, selectedRentalId]);

  const reviewRows = useMemo(() => {
    const source = Array.isArray(reviewsData) && reviewsData.length > 0 ? reviewsData : fallbackReviews;

    return source.map((review, index) => ({
      ...review,
      id: review.id || review.dg_ma || index + 1,
      reviewCode: review.reviewCode || `DG-${String(review.id || review.dg_ma || index + 1).padStart(5, '0')}`,
      customerName: review.customerName || review.author || `Khách hàng #${review.userId || review.user_ma || '-'}`,
      productName: review.productName || `Sản phẩm #${review.productId || review.sp_ma || '-'}`,
      rating: Number(review.rating || review.dg_sosao || 0),
      content: review.content || review.dg_noidung || '',
      createdAt: review.createdAt || review.dg_taomoi || new Date().toISOString(),
      statusLabel: review.status || review.dg_trangthai || 'Chờ duyệt',
      orderId: review.orderId || review.dh_ma || '-',
      orderStatus: review.orderStatus || '-',
    }));
  }, [reviewsData]);

  const filteredReviewRows = useMemo(() => {
    const query = normalizeText(reviewQuery);

    return reviewRows.filter((review) => {
      const matchesQuery = !query || normalizeText([
        review.reviewCode,
        review.customerName,
        review.productName,
      ].join(' ')).includes(query);
      const matchesRating = reviewRatingFilter === 'Tất cả' || String(review.rating) === String(reviewRatingFilter);
      const matchesStatus = reviewStatusFilter === 'Tất cả' || normalizeText(review.statusLabel) === normalizeText(reviewStatusFilter);
      return matchesQuery && matchesRating && matchesStatus;
    });
  }, [reviewQuery, reviewRatingFilter, reviewRows, reviewStatusFilter]);

  const selectedReview = useMemo(() => {
    if (!filteredReviewRows.length) {
      return null;
    }

    return filteredReviewRows.find((review) => String(review.id) === String(selectedReviewId)) || filteredReviewRows[0];
  }, [filteredReviewRows, selectedReviewId]);

  const filteredOrderRows = useMemo(() => {
    const query = normalizeText(orderQuery);

    return orderRows.filter((order) => {
      const matchesQuery = !query || normalizeText([
        order.id,
        order.customerName,
        order.orderNumber,
        order.phone,
      ].join(' ')).includes(query);
      const matchesStatus = orderStatusFilter === 'Tất cả' || normalizeText(order.statusLabel) === normalizeText(orderStatusFilter);

      return matchesQuery && matchesStatus;
    });
  }, [orderQuery, orderRows, orderStatusFilter]);

  const selectedOrder = useMemo(() => {
    if (!filteredOrderRows.length) {
      return null;
    }

    return filteredOrderRows.find((order) => String(order.id) === String(selectedOrderId)) || filteredOrderRows[0];
  }, [filteredOrderRows, selectedOrderId]);

  const customerRows = useMemo(() => {
    const source = users.filter((user) => normalizeText(user.role) === 'customer');

    return source.map((customer, index) => {
      const userKey = String(customer.id || customer.userId || customer._id || '');

      const orderCount = (Array.isArray(orders) ? orders : []).filter((o) => {
        const k = String(o.userId || o.user_ma || o.customerId || o.user || o.user_id || o.customer || '');
        return k === userKey;
      }).length;
      const rentalCount = (Array.isArray(rentals) ? rentals : []).filter((r) => {
        const k = String(r.userId || r.user_ma || r.customerId || r.customer || r.user || '');
        return k === userKey;
      }).length;
      const voucherCount = (Array.isArray(voucherCustomers) ? voucherCustomers : []).filter((v) => {
        const k = String(v.userId || v.user_ma || v.id || v.customerId || v.customer || '');
        return k === userKey;
      }).length;

      return {
        ...customer,
        id: customer.id || `CUS-${index + 1}`,
        fullName: getPersonName(customer),
        statusLabel: getCustomerStatusLabel(customer),
        pointLabel: Number(customer.membershipPoints || customer.points || 0),
        activationStatus: customer.activationStatus || (customer.isLocked ? 'Chưa kích hoạt' : 'Đã kích hoạt'),
        orderCount,
        rentalCount,
        voucherCount,
        address: customer.address || 'Chưa cập nhật',
        addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
      };
    });
  }, [users, orders, rentals, voucherCustomers]);

  const usersById = useMemo(() => new Map(users.map((user) => [String(user.id), user])), [users]);

  const pendingOrderRows = useMemo(
    () => orderRows.filter((order) => normalizeText(order.statusLabel).includes('cho xac nhan')),
    [orderRows]
  );

  const lowStockProductRows = useMemo(
    () => (Array.isArray(products) ? products : []).filter((product) => Number(product.stock ?? 0) <= 5),
    [products]
  );

  const activeVoucherRows = useMemo(
    () => managedVouchers.filter((voucher) => getVoucherStatusLabel(voucher.status) === 'Đang hoạt động'),
    [managedVouchers]
  );

  const pendingChatSessionRows = useMemo(
    () => chatSessions.filter((session) => isHumanAssignedChatSession(session) && !(Number(session.nv_ma || 0) > 0) && normalizeText(session.status) !== 'closed'),
    [chatSessions]
  );

  const recentChatSessionRows = useMemo(() => (
    [...chatSessions]
      .filter((session) => isHumanAssignedChatSession(session))
      .sort((left, right) => new Date(right.updated_at || right.ph_batdau || 0) - new Date(left.updated_at || left.ph_batdau || 0))
      .slice(0, 4)
      .map((session) => ({
        id: session._id || session.ph_ma,
        customerName: getChatSessionCustomerName(session, usersById),
        statusLabel: Number(session.nv_ma || 0) > 0 ? 'Đang hỗ trợ' : 'Chờ hỗ trợ',
        updatedAt: session.updated_at || session.ph_batdau,
      }))
  ), [chatSessions, usersById]);

  const recentCustomerRows = useMemo(() => (
    [...customerRows]
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
      .slice(0, 4)
  ), [customerRows]);

  const recentReviewRows = useMemo(() => (
    [...reviewRows]
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
      .slice(0, 4)
  ), [reviewRows]);

  const dashboardNotifications = useMemo(() => {
    const items = [];
    if (pendingOrderRows.length > 0) {
      items.push(`Có ${pendingOrderRows.length} đơn hàng đang chờ xác nhận.`);
    }
    if (lowStockProductRows.length > 0) {
      items.push(`Có ${lowStockProductRows.length} sản phẩm sắp hết hàng.`);
    }
    if (pendingChatSessionRows.length > 0) {
      items.push(`Có ${pendingChatSessionRows.length} cuộc hội thoại khách hàng đang chờ hỗ trợ.`);
    }
    return items;
  }, [lowStockProductRows.length, pendingChatSessionRows.length, pendingOrderRows.length]);

  const filteredCustomerRows = useMemo(() => {
    const query = normalizeText(customerQuery);

    return customerRows.filter((customer) => {
      const matchesQuery = !query || normalizeText([
        customer.id,
        customer.fullName,
        customer.email,
        customer.phone,
      ].join(' ')).includes(query);
      const matchesStatus = customerStatusFilter === 'Tất cả' || normalizeText(customer.statusLabel) === normalizeText(customerStatusFilter);

      return matchesQuery && matchesStatus;
    });
  }, [customerQuery, customerRows, customerStatusFilter]);

  const selectedCustomer = useMemo(() => {
    if (!filteredCustomerRows.length) {
      return null;
    }

    return filteredCustomerRows.find((customer) => String(customer.id) === String(selectedCustomerId)) || filteredCustomerRows[0];
  }, [filteredCustomerRows, selectedCustomerId]);

  const employeeRows = useMemo(() => {
    const source = (collections.employees && collections.employees.length > 0)
      ? collections.employees
      : demoEmployeeProfiles;

    return source.map((employee, index) => ({
      ...employee,
      id: employee.id || employee.nv_ma || `EMP-${index + 1}`,
      fullName: employee.fullName || employee.nv_hoten || employee.name || `Nhân viên #${index + 1}`,
      statusLabel: getEmployeeStatusLabel(employee),
      roleLabel: employee.role || employee.position || 'staff',
    }));
  }, [collections.employees]);

  const filteredEmployeeRows = useMemo(() => {
    const query = normalizeText(employeeQuery);

    return employeeRows.filter((employee) => {
      const matchesQuery = !query || normalizeText([
        employee.id,
        employee.fullName,
        employee.email,
        employee.phone,
      ].join(' ')).includes(query);
      const matchesStatus = employeeStatusFilter === 'Tất cả' || normalizeText(employee.statusLabel) === normalizeText(employeeStatusFilter);

      return matchesQuery && matchesStatus;
    });
  }, [employeeQuery, employeeRows, employeeStatusFilter]);

  const selectedEmployee = useMemo(() => {
    if (!filteredEmployeeRows.length) {
      return null;
    }

    return filteredEmployeeRows.find((employee) => String(employee.id) === String(selectedEmployeeId)) || filteredEmployeeRows[0];
  }, [filteredEmployeeRows, selectedEmployeeId]);

  const categoryOptions = useMemo(() => {
    const collectionItems = Array.isArray(collections.categories) ? collections.categories : [];
    const fallbackOptions = products.map((product) => product.category);
    const options = [...collectionItems.map((item) => item.name || item.slug || item.title), ...fallbackOptions];

    return [...new Set(options.filter(Boolean))];
  }, [collections.categories, products]);

  const brandOptions = useMemo(() => {
    const collectionItems = Array.isArray(collections.brands) ? collections.brands : [];
    const fallbackOptions = products.flatMap((product) => [product.brand, product.publisher]);
    const options = [...collectionItems.map((item) => item.name || item.title), ...fallbackOptions];

    return [...new Set(options.filter(Boolean))];
  }, [collections.brands, products]);

  const categoryRows = useMemo(() => {
    const source = (collections.categories && collections.categories.length > 0)
      ? collections.categories
      : categoryOptions.map((name, index) => ({
        id: index + 1,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''),
        status: 'Hoạt động',
      }));

    return source.map((item, index) => ({
      ...item,
      id: item.id || item._id || item.loai_ma || index + 1,
      name: item.name || item.title || item.loai_ten || `Danh mục ${index + 1}`,
      slug: item.slug || item.loai_slug || (item.name || item.title || item.loai_ten || '').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''),
      productCount: getCategoryProductCount(item.name || item.title || item.loai_ten || '', products),
      statusLabel: getCollectionStatusLabel(item),
    }));
  }, [collections.categories, categoryOptions, products]);

  const filteredCategoryRows = useMemo(() => {
    const query = normalizeText(categoryQuery);

    return categoryRows.filter((item) => !query || normalizeText([item.name, item.slug].join(' ')).includes(query));
  }, [categoryQuery, categoryRows]);

  const brandRows = useMemo(() => {
    const source = (collections.brands && collections.brands.length > 0)
      ? collections.brands
      : brandOptions.map((name, index) => ({
        id: index + 1,
        name,
        country: '',
        website: '',
        status: 'Hoạt động',
      }));

    return source.map((item, index) => ({
      ...item,
      id: item.id || item._id || item.nxb_ma || index + 1,
      name: item.name || item.title || item.nxb_ten || `Thương hiệu ${index + 1}`,
      country: item.country || item.nxb_quocgia || '-',
      website: item.website || item.nxb_website || '-',
      productCount: getBrandProductCount(item.name || item.title || item.nxb_ten || '', products),
      statusLabel: getCollectionStatusLabel(item),
    }));
  }, [brandOptions, collections.brands, products]);

  const filteredBrandRows = useMemo(() => {
    const query = normalizeText(brandQuery);

    return brandRows.filter((item) => !query || normalizeText([item.name, item.country, item.website].join(' ')).includes(query));
  }, [brandQuery, brandRows]);

  const requestJson = useCallback(async (path, options = {}) => {
    let response;
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || 15000);
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    const { timeoutMs: _unusedTimeoutMs, ...fetchOptions } = options;

    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(fetchOptions.headers || {}),
        },
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Yêu cầu xử lý quá lâu, vui lòng thử lại.');
      }
      throw new Error('Không thể kết nối máy chủ quản trị.');
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (response.status === 204) {
      return null;
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || 'Thao tác không thành công.');
    }

    return payload;
  }, [token]);

  const loadReports = useCallback(async () => {
    if (!isAuthenticated() || !isAdmin) {
      setReportLoading(false);
      return;
    }

    try {
      setReportError('');
      setReportLoading(true);

      const range = getReportRange(reportPreset, reportDateCursor, reportStartDate, reportEndDate);
      const params = new URLSearchParams({ preset: range.preset });

      params.set('startDate', toDateInputValue(range.from));
      params.set('endDate', toDateInputValue(range.to));

      const data = await requestJson(`/admin/reports?${params.toString()}`, { method: 'GET', timeoutMs: 12000 });
      setReportData(data || null);
      if (!data) {
        setReportError('Không nhận được dữ liệu báo cáo từ máy chủ.');
      }
    } catch (error) {
      setReportData(null);
      setReportError(error.message || 'Không thể tải báo cáo từ dữ liệu thật.');
    } finally {
      setReportLoading(false);
    }
  }, [isAdmin, reportDateCursor, reportEndDate, reportPreset, reportStartDate, requestJson]);

  function exportCsv(filename, rows) {
    const csvContent = rows.map((row) => row.map((cell) => {
      const value = String(cell ?? '');
      return `"${value.replace(/"/g, '""')}"`;
    }).join(',')).join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    if (!reportData) {
      setReportError('Chưa có dữ liệu báo cáo để xuất.');
      return;
    }

    const rows = [
      ['Thống kê - Báo cáo', new Date().toLocaleString('vi-VN')],
      [],
      ['Tổng doanh thu', reportData.summary.totalRevenue],
      ['Tổng đơn hàng', reportData.summary.totalOrders],
      ['Tổng khách hàng', reportData.summary.totalCustomers],
      ['Tổng sản phẩm', reportData.summary.totalProducts],
      [],
      ['Doanh thu theo tháng'],
      ['Tháng', 'Doanh thu'],
      ...reportData.revenue.monthlyComparison.map((item) => [item.label, item.revenue]),
      [],
      ['Đơn hàng theo trạng thái'],
      ['Trạng thái', 'Số lượng'],
      ...reportData.orders.statusDistribution.map((item) => [item.label, item.value]),
      [],
      ['Top 10 sản phẩm bán chạy'],
      ['Sản phẩm', 'Số lượng', 'Doanh thu'],
      ...reportData.products.topSelling.map((item) => [item.name, item.quantity, item.revenue]),
      [],
      ['Top khách hàng chi tiêu'],
      ['Khách hàng', 'Tổng chi tiêu'],
      ...reportData.customers.topSpenders.map((item) => [item.customerName, item.totalSpend]),
      [],
      ['Voucher sử dụng nhiều nhất'],
      ['Mã voucher', 'Lượt dùng', 'Doanh thu'],
      ...reportData.promotions.topVouchers.map((item) => [item.code, item.usageCount, item.revenue]),
    ];

    exportCsv(`bao-cao-${Date.now()}.csv`, rows);
  }

  function handleExportPdf() {
    if (!reportData) {
      setReportError('Chưa có dữ liệu báo cáo để xuất.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1024,height=768');
    if (!printWindow) {
      setErrorMessage('Trình duyệt đã chặn cửa sổ in PDF.');
      return;
    }

    const statusRows = reportData.orders.statusDistribution.map((item) => `<tr><td>${item.label}</td><td>${item.value}</td></tr>`).join('');
    const topSellingRows = reportData.products.topSelling.map((item) => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${Number(item.revenue || 0).toLocaleString('vi-VN')}</td></tr>`).join('');
    const topCustomersRows = reportData.customers.topSpenders.map((item) => `<tr><td>${item.customerName}</td><td>${Number(item.totalSpend || 0).toLocaleString('vi-VN')}</td></tr>`).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Thống kê - Báo cáo</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1, h2 { margin: 0 0 8px; }
            .meta { margin-bottom: 16px; color: #444; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Thống kê - Báo cáo</h1>
          <p class="meta">Thời gian xuất: ${new Date().toLocaleString('vi-VN')}</p>
          <h2>Tổng quan</h2>
          <table>
            <tr><th>Chỉ số</th><th>Giá trị</th></tr>
            <tr><td>Tổng doanh thu</td><td>${Number(reportData.summary.totalRevenue || 0).toLocaleString('vi-VN')} đ</td></tr>
            <tr><td>Tổng đơn hàng</td><td>${reportData.summary.totalOrders || 0}</td></tr>
            <tr><td>Tổng khách hàng</td><td>${reportData.summary.totalCustomers || 0}</td></tr>
            <tr><td>Tổng sản phẩm</td><td>${reportData.summary.totalProducts || 0}</td></tr>
          </table>
          <h2>Trạng thái đơn hàng</h2>
          <table><tr><th>Trạng thái</th><th>Số lượng</th></tr>${statusRows}</table>
          <h2>Top sản phẩm bán chạy</h2>
          <table><tr><th>Sản phẩm</th><th>Số lượng</th><th>Doanh thu</th></tr>${topSellingRows}</table>
          <h2>Top khách hàng</h2>
          <table><tr><th>Khách hàng</th><th>Tổng chi tiêu</th></tr>${topCustomersRows}</table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  useEffect(() => {
    document.title = 'Quản trị | Board Game VN';

    const previousBodyBackground = document.body.style.background;
    const previousBodyMinHeight = document.body.style.minHeight;
    const previousHtmlBackground = document.documentElement.style.background;

    document.body.style.background = '#fff';
    document.body.style.minHeight = '100vh';
    document.documentElement.style.background = '#fff';

    return () => {
      document.body.style.background = previousBodyBackground;
      document.body.style.minHeight = previousBodyMinHeight;
      document.documentElement.style.background = previousHtmlBackground;
    };
  }, []);

  const refreshData = useCallback(async () => {
    const summaryData = await requestJson('/admin/summary', { method: 'GET' }).catch(() => getFallbackSummaryData());
    const [productsData, ordersData, rentalsData, reviewsPayload, usersData, vouchersData, voucherCustomersData, legacyVoucherData, legacyPromotionsData, rentalOptionsData, chatSessionsData, ...collectionData] = await Promise.all([
      requestJson('/products', { method: 'GET' }).catch(() => fallbackProducts),
      requestJson('/orders', { method: 'GET' }).catch(() => fallbackOrders),
      requestJson('/rentals', { method: 'GET' }).catch(() => fallbackRentalOrders),
      requestJson('/reviews', { method: 'GET' }).catch(() => fallbackReviews),
      requestJson('/admin/users', { method: 'GET' }).catch(() => []),
      requestJson('/vouchers/admin', { method: 'GET' }).catch(() => []),
      requestJson('/vouchers/admin/customers', { method: 'GET' }).catch(() => []),
      requestJson('/admin/collections/voucher', { method: 'GET' }).catch(() => []),
      requestJson('/admin/collections/promotions', { method: 'GET' }).catch(() => []),
      requestJson('/rentals/options', { method: 'GET' }).catch(() => ({ vouchers: [] })),
      requestJson('/admin/collections/chatbot_phienhoithoai', { method: 'GET' }).catch(() => []),
      ...collectionKeys.map((collectionName) => requestJson(`/admin/collections/${collectionName}`, { method: 'GET' }).catch(() => [])),
    ]);

    setSummary(summaryData || getFallbackSummaryData());
    setProducts(Array.isArray(productsData) ? productsData : fallbackProducts);
    setOrders(Array.isArray(ordersData) ? ordersData : fallbackOrders);
    setRentals(Array.isArray(rentalsData) ? rentalsData : fallbackRentalOrders);
    setReviewsData(Array.isArray(reviewsPayload) ? reviewsPayload : fallbackReviews);
    setUsers(Array.isArray(usersData) ? usersData : []);
    setChatSessions(Array.isArray(chatSessionsData) ? chatSessionsData : []);
    setManagedVouchers(
      mergeVoucherSources(
        Array.isArray(vouchersData) ? vouchersData : [],
        Array.isArray(legacyVoucherData) ? legacyVoucherData : [],
        Array.isArray(legacyPromotionsData) ? legacyPromotionsData : [],
        Array.isArray(rentalOptionsData?.vouchers) ? rentalOptionsData.vouchers : []
      )
    );
    const fallbackCustomers = mapCustomersFromUsers(Array.isArray(usersData) ? usersData : []);
    setVoucherCustomers(
      Array.isArray(voucherCustomersData) && voucherCustomersData.length > 0
        ? voucherCustomersData
        : fallbackCustomers
    );
    setCollections(
      collectionKeys.reduce((state, collectionName, index) => {
        state[collectionName] = Array.isArray(collectionData[index]) ? collectionData[index] : [];
        return state;
      }, {})
    );

    if (activeSection === 'reports') {
      await loadReports();
    }
  }, [activeSection, collectionKeys, loadReports, requestJson]);

  useEffect(() => {
    if (!isAuthenticated() || !hasAuthUser) {
      return;
    }

    if (!canAccessAdminPanel) {
      return;
    }

    async function loadPurchaseData() {
      try {
        const suppliers = await requestJson('/purchases/suppliers', { method: 'GET' }).catch(() => []);
        const receipts = await requestJson('/purchases', { method: 'GET' }).catch(() => []);
        setSupplierOptions(Array.isArray(suppliers) ? suppliers : []);
        setPurchaseReceipts(Array.isArray(receipts) ? receipts : []);
      } catch (error) {
        setPurchaseReceipts([]);
        setSupplierOptions([]);
      }
    }

    loadPurchaseData();
  }, [canAccessAdminPanel, hasAuthUser, requestJson]);

  useEffect(() => {
    if (!isAuthenticated() || !hasAuthUser) {
      return undefined;
    }

    if (!canAccessAdminPanel) {
      return undefined;
    }

    const stream = new EventSource(`${API_BASE}/admin/orders/stream`);
    const refreshFromEvent = () => {
      refreshData().catch(() => null);
    };

    stream.addEventListener('order-event', refreshFromEvent);
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.removeEventListener('order-event', refreshFromEvent);
      stream.close();
    };
  }, [canAccessAdminPanel, hasAuthUser, refreshData]);

  useEffect(() => {
    if (!isAuthenticated() || !hasAuthUser) {
      return;
    }

    if (!canAccessAdminPanel) {
      return;
    }

    async function loadData() {
      try {
        setErrorMessage('');

        const [summaryData, productsData, ordersData, rentalsData, reviewsPayload, usersData, vouchersData, voucherCustomersData, legacyVoucherData, legacyPromotionsData, rentalOptionsData, chatSessionsData, ...collectionData] = await Promise.all([
          requestJson('/admin/summary', { method: 'GET' }).catch(() => getFallbackSummaryData()),
          requestJson('/products', { method: 'GET' }).catch(() => fallbackProducts),
          requestJson('/orders', { method: 'GET' }).catch(() => fallbackOrders),
          requestJson('/rentals', { method: 'GET' }).catch(() => fallbackRentalOrders),
          requestJson('/reviews', { method: 'GET' }).catch(() => fallbackReviews),
          requestJson('/admin/users', { method: 'GET' }).catch(() => []),
          requestJson('/vouchers/admin', { method: 'GET' }).catch(() => []),
          requestJson('/vouchers/admin/customers', { method: 'GET' }).catch(() => []),
          requestJson('/admin/collections/voucher', { method: 'GET' }).catch(() => []),
          requestJson('/admin/collections/promotions', { method: 'GET' }).catch(() => []),
          requestJson('/rentals/options', { method: 'GET' }).catch(() => ({ vouchers: [] })),
          requestJson('/admin/collections/chatbot_phienhoithoai', { method: 'GET' }).catch(() => []),
          ...collectionKeys.map((collectionName) => requestJson(`/admin/collections/${collectionName}`, { method: 'GET' }).catch(() => [])),
        ]);

        setSummary(summaryData || getFallbackSummaryData());
        setProducts(Array.isArray(productsData) ? productsData : fallbackProducts);
        setOrders(Array.isArray(ordersData) ? ordersData : fallbackOrders);
        setRentals(Array.isArray(rentalsData) ? rentalsData : fallbackRentalOrders);
        setReviewsData(Array.isArray(reviewsPayload) ? reviewsPayload : fallbackReviews);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setChatSessions(Array.isArray(chatSessionsData) ? chatSessionsData : []);
        setManagedVouchers(
          mergeVoucherSources(
            Array.isArray(vouchersData) ? vouchersData : [],
            Array.isArray(legacyVoucherData) ? legacyVoucherData : [],
            Array.isArray(legacyPromotionsData) ? legacyPromotionsData : [],
            Array.isArray(rentalOptionsData?.vouchers) ? rentalOptionsData.vouchers : []
          )
        );
        const fallbackCustomers = mapCustomersFromUsers(Array.isArray(usersData) ? usersData : []);
        setVoucherCustomers(
          Array.isArray(voucherCustomersData) && voucherCustomersData.length > 0
            ? voucherCustomersData
            : fallbackCustomers
        );
        setCollections(
          collectionKeys.reduce((state, collectionName, index) => {
            state[collectionName] = Array.isArray(collectionData[index]) ? collectionData[index] : [];
            return state;
          }, {})
        );
      } catch (error) {
        setErrorMessage('');
        setStatusMessage('Không thể tải dữ liệu mới. Đang giữ dữ liệu hiện tại.');
      }
    }

    loadData();
  }, [canAccessAdminPanel, collectionKeys, hasAuthUser, requestJson]);

  useEffect(() => {
    if (activeSection === 'reports') {
      loadReports();
    }
  }, [activeSection, loadReports]);

  const shiftReportPeriod = useCallback((direction) => {
    const dateCopy = new Date(reportDateCursor);
    const preset = reportPreset === 'today' ? 'day' : reportPreset;

    if (preset === 'day') {
      dateCopy.setDate(dateCopy.getDate() + direction);
    } else if (preset === 'week') {
      dateCopy.setDate(dateCopy.getDate() + direction * 7);
    } else if (preset === 'month') {
      dateCopy.setMonth(dateCopy.getMonth() + direction);
    } else if (preset === 'year') {
      dateCopy.setFullYear(dateCopy.getFullYear() + direction);
    }

    setReportDateCursor(dateCopy);
  }, [reportDateCursor, reportPreset]);

  useEffect(() => {
    if (!isAdmin && activeSection !== 'promotions') {
      setActiveSection('promotions');
    }
  }, [activeSection, isAdmin]);

  if (!isAuthenticated() || !hasAuthUser) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessAdminPanel) {
    return <Navigate to="/account" replace />;
  }

  function resetVoucherEditor() {
    setVoucherForm(voucherInitialState);
    setEditingVoucherId('');
    setSelectedVoucherCustomers([]);
    setVoucherLimitCustomers('0');
    setVoucherMaxUsesPerCustomer('1');
  }

  function openVoucherEditor(voucher = null) {
    if (!voucher) {
      resetVoucherEditor();
      return;
    }

    const customerIds = Array.isArray(voucher.assignedCustomers) ? voucher.assignedCustomers.map((item) => String(item.userId)) : [];

    setEditingVoucherId(String(voucher.id));
    setVoucherForm({
      title: voucher.title || '',
      code: voucher.code || '',
      scope: voucher.scope || 'public',
      description: voucher.description || '',
      discountType: Number(voucher.discountType || 2),
      value: String(voucher.value || ''),
      maxDiscount: String(voucher.maxDiscount || ''),
      minAmount: String(voucher.minAmount || ''),
      startDate: voucher.startDate ? String(voucher.startDate).slice(0, 10) : '',
      endDate: voucher.endDate ? String(voucher.endDate).slice(0, 10) : '',
      quantity: String(voucher.quantity || ''),
      maxUsesPerCustomer: Number(voucher.maxUsesPerCustomer || 1),
      status: voucher.status || 'active',
    });
    setSelectedVoucherCustomers(customerIds);
    setVoucherLimitCustomers(voucher.assignedCustomerCount ? String(voucher.assignedCustomerCount) : '0');
    setVoucherMaxUsesPerCustomer(String(voucher.maxUsesPerCustomer || 1));
  }

  async function handleVoucherSubmit(event) {
    event.preventDefault();

    const payload = {
      ...voucherForm,
      value: Number(voucherForm.value || 0),
      maxDiscount: Number(voucherForm.maxDiscount || 0),
      minAmount: Number(voucherForm.minAmount || 0),
      quantity: Number(voucherForm.quantity || 0),
      discountType: Number(voucherForm.discountType || 2),
      maxUsesPerCustomer: Number(voucherForm.maxUsesPerCustomer || 1),
    };

    const legacyPayload = {
      vc_code: String(payload.code || '').trim().toUpperCase(),
      vc_ten: String(payload.title || '').trim(),
      vc_mota: String(payload.description || '').trim(),
      vc_scope: payload.scope || 'public',
      vc_loaigiamgia: Number(payload.discountType || 2),
      vc_giatri: Number(payload.value || 0),
      vc_giamtoida: Number(payload.maxDiscount || 0),
      vc_dieukien_toithieu: Number(payload.minAmount || 0),
      vc_soluong: Number(payload.quantity || 0),
      vc_solan_sudung_toi_da: Number(payload.maxUsesPerCustomer || 1),
      vc_ngaybatdau: payload.startDate || null,
      vc_ngayketthuc: payload.endDate || null,
      vc_trangthai: payload.status || 'active',
    };

    if (!payload.code || !payload.title) {
      setErrorMessage('Vui lòng nhập tên và mã voucher.');
      return;
    }

    try {
      try {
        if (editingVoucherId) {
          await requestJson(`/vouchers/admin/${editingVoucherId}`, { method: 'PUT', body: JSON.stringify(payload) });
          setStatusMessage('Đã cập nhật voucher.');
        } else {
          await requestJson('/vouchers/admin', { method: 'POST', body: JSON.stringify(payload) });
          setStatusMessage('Đã tạo voucher mới.');
        }
      } catch (primaryError) {
        // Fallback for stale backend or legacy route shape.
        const legacyRows = await requestJson('/admin/collections/voucher', { method: 'GET' }).catch(() => []);
        const matchedLegacy = Array.isArray(legacyRows)
          ? legacyRows.find((item) => normalizeText(item.vc_code || item.code || '') === normalizeText(payload.code))
          : null;

        if (matchedLegacy) {
          await requestJson(`/admin/collections/voucher/${matchedLegacy._id || matchedLegacy.id}`, {
            method: 'PUT',
            body: JSON.stringify(legacyPayload),
          });
          setStatusMessage('Đã cập nhật voucher (chế độ tương thích).');
        } else {
          await requestJson('/admin/collections/voucher', {
            method: 'POST',
            body: JSON.stringify({
              vc_ma: Date.now(),
              vc_dasudung: 0,
              ...legacyPayload,
            }),
          });
          setStatusMessage('Đã tạo voucher mới (chế độ tương thích).');
        }

        if (primaryError?.message && primaryError.message !== 'Thao tác không thành công.') {
          setErrorMessage(`API mới lỗi: ${primaryError.message}. Đã tự chuyển sang chế độ tương thích.`);
        }
      }

      await refreshData();
      resetVoucherEditor();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật voucher. Vui lòng thử lại.');
    }
  }

  async function handleVoucherAssignCustomers(voucherId) {
    const maxCustomers = Number(voucherLimitCustomers || 0);
    const maxUsesPerCustomer = Number(voucherMaxUsesPerCustomer || 1);
    const uniqueCustomers = [...new Set(selectedVoucherCustomers.map((item) => String(item)))];
    const pickedCustomers = maxCustomers > 0 ? uniqueCustomers.slice(0, maxCustomers) : uniqueCustomers;

    if (pickedCustomers.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một khách hàng để cấp voucher riêng tư.');
      return;
    }

    try {
      await requestJson(`/vouchers/admin/${voucherId}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({
          customerIds: pickedCustomers,
          maxCustomers,
          maxUsesPerCustomer,
        }),
      });

      setStatusMessage('Đã cập nhật danh sách khách hàng nhận voucher.');
      await refreshData();
      return;
    } catch (primaryError) {
      // Fallback compatibility for stale/new-old mixed backend states.
      const legacyVouchers = await requestJson('/admin/collections/voucher', { method: 'GET' }).catch(() => []);
      const selectedCode = String(voucherForm.code || selectedVoucher?.code || '').trim().toUpperCase();
      const matchedVoucher = Array.isArray(legacyVouchers)
        ? legacyVouchers.find((item) => normalizeText(item.vc_code || item.code || '') === normalizeText(selectedCode))
        : null;

      if (!matchedVoucher) {
        setErrorMessage(primaryError?.message || 'Không tìm thấy voucher để gán khách hàng riêng tư. Vui lòng lưu voucher trước.');
        return;
      }

      const voucherNumericId = Number(matchedVoucher.vc_ma || matchedVoucher.id || 0);
      if (!voucherNumericId) {
        setErrorMessage('Voucher chưa có mã nội bộ hợp lệ để gán khách hàng. Vui lòng cập nhật lại voucher trước.');
        return;
      }

      const assignmentRows = await requestJson('/admin/collections/voucher_khachhang', { method: 'GET' }).catch(() => []);
      const existingRows = Array.isArray(assignmentRows)
        ? assignmentRows.filter((item) => Number(item.vc_ma || item.voucherId || 0) === voucherNumericId)
        : [];

      const selectedSet = new Set(pickedCustomers.map((item) => String(item)));

      for (const row of existingRows) {
        const rowUserId = String(row.user_ma || row.userId || '');
        if (!selectedSet.has(rowUserId)) {
          await requestJson(`/admin/collections/voucher_khachhang/${row._id || row.id}`, { method: 'DELETE' }).catch(() => null);
        }
      }

      for (const customerId of pickedCustomers) {
        const matchedRow = existingRows.find((item) => String(item.user_ma || item.userId || '') === String(customerId));

        if (matchedRow) {
          await requestJson(`/admin/collections/voucher_khachhang/${matchedRow._id || matchedRow.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              ...matchedRow,
              maxUses: maxUsesPerCustomer,
              status: 'active',
              updatedAt: new Date().toISOString(),
            }),
          });
          continue;
        }

        await requestJson('/admin/collections/voucher_khachhang', {
          method: 'POST',
          body: JSON.stringify({
            id: Date.now() + Number(customerId),
            vc_ma: voucherNumericId,
            user_ma: Number(customerId),
            maxUses: maxUsesPerCustomer,
            usedCount: 0,
            da_su_dung: 0,
            status: 'active',
            assignedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
      }

      await requestJson(`/admin/collections/voucher/${matchedVoucher._id || matchedVoucher.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...matchedVoucher,
          vc_scope: 'private',
          vc_solan_sudung_toi_da: maxUsesPerCustomer,
          updatedAt: new Date().toISOString(),
        }),
      }).catch(() => null);

      setStatusMessage('Đã lưu danh sách khách hàng riêng tư (chế độ tương thích).');
      if (primaryError?.message) {
        setErrorMessage(`API mới lỗi: ${primaryError.message}. Đã chuyển sang chế độ tương thích.`);
      }
      await refreshData();
    }
  }

  async function handleVoucherDelete(voucher) {
    if (!window.confirm('Xóa voucher này?')) {
      return;
    }

    const code = String(voucher.code || voucher.vc_code || '').trim().toUpperCase();
    const rawId = String(voucher.rawId || voucher.id || '').trim();
    const isLegacy = voucher.source && voucher.source !== 'voucher';

    try {
      if (isLegacy && rawId) {
        const collectionName = voucher.source === 'promotion' ? 'promotions' : 'voucher';
        await requestJson(`/admin/collections/${collectionName}/${encodeURIComponent(rawId)}`, { method: 'DELETE' });
      } else {
        const safeId = rawId || code || String(voucher.id || '');
        await requestJson(`/vouchers/admin/${encodeURIComponent(safeId)}`, { method: 'DELETE' });
      }
      setStatusMessage('Đã xóa voucher.');
      await refreshData();
      if (String(editingVoucherId) === String(voucher.rawId) || String(editingVoucherId) === String(voucher.id) || String(editingVoucherId) === String(code)) {
        resetVoucherEditor();
      }
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xóa voucher.');
    }
  }

  async function handleVoucherStatusChange(voucher, nextStatus) {
    await requestJson(`/vouchers/admin/${voucher.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    setStatusMessage('Đã cập nhật trạng thái voucher.');
    await refreshData();
  }

  function toggleVoucherCustomer(customerId) {
    setSelectedVoucherCustomers((current) => {
      if (current.includes(String(customerId))) {
        return current.filter((item) => item !== String(customerId));
      }

      return [...current, String(customerId)];
    });
  }

  function handleLogout() {
    clearAuthUser();
    window.location.href = '/';
  }

  function handleProductChange(event) {
    const { name, value } = event.target;
    setProductForm((current) => ({ ...current, [name]: value }));
  }

  function handleCollectionFieldChange(collectionName, fieldName, value) {
    setGenericForms((current) => ({
      ...current,
      [collectionName]: {
        ...(current[collectionName] || {}),
        [fieldName]: value,
      },
    }));
  }

  function populateProductForm(product) {
    setEditingProductId(product.id);
    setProductForm({
      id: String(product.id || ''),
      name: product.name || '',
      category: product.category || 'Chiến lược',
      brand: product.brand || '',
      publisher: product.publisher || '',
      stock: String(product.stock ?? 0),
      players: product.players || '',
      age: product.age || '',
      playTime: product.playTime || '',
      price: String(product.price ?? ''),
      discount: String(product.discount ?? 0),
      rating: String(product.rating ?? 0),
      reviews: String(product.reviews ?? 0),
      image: product.image || '',
      labels: toLabelsString(product.labels),
      description: product.description || '',
    });
    setActiveSection('products');
  }

  function populateCollectionForm(collectionName, item) {
    const config = collectionConfigs[collectionName];
    const nextForm = config.fields.reduce((fields, field) => {
      if (field.type === 'boolean') {
        fields[field.name] = String(Boolean(item[field.name])) ;
      } else if (field.type === 'select') {
        fields[field.name] = item[field.name] || field.options?.[0] || '';
      } else {
        fields[field.name] = item[field.name] ?? '';
      }
      return fields;
    }, {});

    setEditingCollection({ collectionName, documentId: item._id || item.id });
    if (collectionName === 'categories') {
      setSelectedCategoryId(String(item.id || item._id || item.loai_ma || ''));
    } else if (collectionName === 'brands') {
      setSelectedBrandId(String(item.id || item._id || item.nxb_ma || ''));
    }
    setGenericForms((current) => ({
      ...current,
      [collectionName]: nextForm,
    }));
    if (collectionName === 'employees') {
      setSelectedEmployeeId(String(item.id || item.nv_ma || item._id));
    }
    setActiveSection(collectionName);
  }

  async function handleProductSubmit(event) {
    event.preventDefault();

    const normalizeSupplierName = (value) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const everjoySupplier = supplierOptions.find((supplier) => {
      const supplierName = String(supplier?.ncc_ten || supplier?.name || '').trim();
      return normalizeSupplierName(supplierName) === 'everjoy publishing';
    });
    const productSupplierId = Number(everjoySupplier?.ncc_ma ?? everjoySupplier?.id ?? 1);
    const payload = {
      ...productForm,
      labels: productForm.labels,
      ncc_ma: productSupplierId,
      supplierId: productSupplierId,
    };

    if (editingProductId) {
      await requestJson(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setStatusMessage('Đã cập nhật sản phẩm.');
    } else {
      await requestJson('/products', { method: 'POST', body: JSON.stringify(payload) });
      setStatusMessage('Đã thêm sản phẩm mới.');
    }

    setEditingProductId(null);
    setProductForm(productInitialState);
    await refreshData();
  }

  async function handleDeleteProduct(productId) {
    if (!window.confirm('Xóa sản phẩm này?')) {
      return;
    }

    await requestJson(`/products/${productId}`, { method: 'DELETE' });
    setStatusMessage('Đã xóa sản phẩm.');
    await refreshData();
  }

  async function handleOrderStatusChange(order, nextStatus) {
    try {
      setErrorMessage('');
      await requestJson(`/orders/${order.orderNumber || order.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: nextStatus,
          update: `Trạng thái đơn hàng đã được cập nhật sang ${nextStatus}.`,
        }),
      });

      setStatusMessage(`Đã cập nhật đơn hàng ${order.orderNumber || order.id}.`);
      await refreshData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật trạng thái đơn hàng.');
    }
  }

  async function handleRentalStatusChange(rental, nextStatus, nextPaymentStatus) {
    try {
      setErrorMessage('');
      const rentalId = rental.rentalKey || rental.id;
      const payload = {
        status: nextStatus || rental.statusLabel,
        paymentStatus: nextPaymentStatus || rental.paymentStatusLabel,
      };

      if (nextStatus === 'Đã trả hàng' || nextStatus === 'Hoàn thành') {
        payload.actualReturnDate = new Date().toISOString().slice(0, 10);
      }

      if (nextStatus === 'Đã trả hàng' && (rental.totalDeposit || 0) > 0) {
        payload.refundDeposit = rental.totalDeposit;
      }

      await requestJson(`/rentals/${rentalId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setStatusMessage(`Đã cập nhật đơn thuê ${rental.rentalNumber || rental.id}.`);
      await refreshData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật trạng thái đơn thuê.');
    }
  }

  async function handleToggleCustomerLock(user) {
    await requestJson(`/admin/users/${user.id}/lock`, {
      method: 'PATCH',
      body: JSON.stringify({ isLocked: !user.isLocked }),
    });

    setStatusMessage(user.isLocked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
    await refreshData();
  }

  async function handleResetCustomerPassword(user) {
    // open inline reset form for this user
    setResetPasswordError('');
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setResetPasswordForId(String(user.id));
  }

  function handleCancelResetPassword() {
    setResetPasswordForId('');
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setResetPasswordError('');
  }

  async function handleSubmitResetPassword() {
    const userId = resetPasswordForId;
    const newPassword = String(resetPasswordValue || '');
    const confirm = String(resetPasswordConfirm || '');

    if (newPassword.length < 8) {
      setResetPasswordError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirm) {
      setResetPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setResetPasswordLoading(true);
      setResetPasswordError('');
      await requestJson(`/admin/users/${encodeURIComponent(userId)}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      });
      setStatusMessage('Đã cấp lại mật khẩu cho khách hàng.');
      handleCancelResetPassword();
      // preserve current selection and query while refreshing data to avoid losing context or autofill side-effects
      const prevSelected = selectedCustomerId;
      const prevQuery = customerQuery;
      await refreshData();
      setSelectedCustomerId(prevSelected);
      setCustomerQuery(prevQuery);
    } catch (err) {
      setResetPasswordError(err.message || 'Không thể cấp lại mật khẩu.');
    } finally {
      setResetPasswordLoading(false);
    }
  }

  // Silence ESLint no-unused-vars for intentionally used states/handlers in JSX
  void resetPasswordLoading;
  void resetPasswordError;
  void handleSubmitResetPassword;

  async function handleReviewStatusChange(review, nextStatus) {
    try {
      setErrorMessage('');
      await requestJson(`/reviews/${review.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setStatusMessage(`Đã cập nhật trạng thái đánh giá ${review.reviewCode}.`);
      await refreshData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật trạng thái đánh giá.');
    }
  }

  async function handleDeleteReview(reviewId) {
    if (!window.confirm('Xóa đánh giá này?')) {
      return;
    }

    try {
      setErrorMessage('');
      await requestJson(`/reviews/${reviewId}`, { method: 'DELETE' });
      setStatusMessage('Đã xóa đánh giá.');
      await refreshData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xóa đánh giá.');
    }
  }

  async function handleCollectionSubmit(collectionName, event) {
    event.preventDefault();

    const config = collectionConfigs[collectionName];
    const payload = config.fields.reduce((result, field) => {
      const value = genericForms[collectionName]?.[field.name] ?? '';
      if (field.type === 'number') {
        result[field.name] = Number(value || 0);
      } else if (field.type === 'boolean') {
        result[field.name] = value === true || value === 'true' || value === '1';
      } else {
        result[field.name] = value;
      }
      return result;
    }, {});

    if (editingCollection?.collectionName === collectionName) {
      const updatedDocument = await requestJson(`/admin/collections/${collectionName}/${editingCollection.documentId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatusMessage(`Đã cập nhật ${config.title.toLowerCase()}.`);
      setEditingCollection(null);

      if (collectionName === 'categories') {
        const refreshedCategories = await requestJson(`/admin/collections/categories?ts=${Date.now()}`, { method: 'GET' }).catch(() => []);
        setCollections((current) => ({
          ...current,
          categories: Array.isArray(refreshedCategories) ? refreshedCategories : current.categories || [],
        }));
      }

      if (collectionName === 'categories') {
        setSelectedCategoryId(String(updatedDocument?.id || editingCollection.documentId || ''));
      }

      if (collectionName === 'brands') {
        setSelectedBrandId(String(updatedDocument?.id || editingCollection.documentId || ''));
      }

      if (updatedDocument) {
        setCollections((current) => ({
          ...current,
          [collectionName]: Array.isArray(current[collectionName])
            ? current[collectionName].map((item) => {
              const currentId = String(item.id || item._id || item.loai_ma || '');
              const updatedId = String(updatedDocument.id || updatedDocument._id || updatedDocument.loai_ma || editingCollection.documentId || '');

              return currentId === updatedId ? { ...item, ...updatedDocument } : item;
            })
            : [updatedDocument],
        }));
      }
    } else {
      const createdDocument = await requestJson(`/admin/collections/${collectionName}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStatusMessage(`Đã thêm ${config.title.toLowerCase()}.`);

      if (collectionName === 'categories') {
        const refreshedCategories = await requestJson(`/admin/collections/categories?ts=${Date.now()}`, { method: 'GET' }).catch(() => []);
        setCollections((current) => ({
          ...current,
          categories: Array.isArray(refreshedCategories) ? refreshedCategories : [createdDocument, ...(current.categories || [])],
        }));
      }

      if (collectionName === 'categories' && createdDocument) {
        setSelectedCategoryId(String(createdDocument.id || createdDocument._id || createdDocument.loai_ma || ''));
      }

      if (collectionName === 'brands' && createdDocument) {
        setSelectedBrandId(String(createdDocument.id || createdDocument._id || createdDocument.nxb_ma || ''));
      }

      if (createdDocument) {
        setCollections((current) => ({
          ...current,
          [collectionName]: Array.isArray(current[collectionName])
            ? [createdDocument, ...current[collectionName]]
            : [createdDocument],
        }));
      }
    }

    setGenericForms((current) => ({
      ...current,
      [collectionName]: genericInitialState[collectionName],
    }));
    await refreshData();
  }

  async function handleDeleteCollectionItem(collectionName, documentId) {
    if (!window.confirm('Xóa mục này?')) {
      return;
    }

    await requestJson(`/admin/collections/${collectionName}/${documentId}`, { method: 'DELETE' });
    setStatusMessage('Đã xóa mục dữ liệu.');
    await refreshData();
  }

  function handlePurchaseInputChange(field, value) {
    setPurchaseForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleAddPurchaseItem(product) {
    const salePrice = Number(product.price ?? product.sp_giaban ?? 0);
    const productSupplierId = Number(product.ncc_ma ?? product.supplierId ?? product.supplier?.ncc_ma ?? 0);
    const resolvedSupplierId = productSupplierId || Number(product?.supplier?.id || 0);

    if (!resolvedSupplierId) {
      setErrorMessage('Sản phẩm này chưa có nhà cung cấp. Vui lòng cập nhật thông tin sản phẩm.');
      return;
    }

    const supplierName =
      product?.supplier?.ncc_ten
      || product?.supplier?.name
      || getPurchaseSupplierName(resolvedSupplierId)
      || 'Nhà cung cấp';

    setPurchaseForm((current) => ({
      ...current,
      supplierId: current.supplierId || String(resolvedSupplierId),
      items: [
        ...current.items,
        {
          productId: Number(product.id ?? product.sp_ma),
          name: product.name || product.sp_ten || 'Sản phẩm',
          quantity: 1,
          unitPrice: Math.floor(salePrice * 0.6),
          salePrice,
          supplierId: resolvedSupplierId,
          supplierName,
        },
      ],
    }));
    setErrorMessage('');
    setPurchaseSearchProducts('');
  }

  function handlePurchaseItemChange(index, field, value) {
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value || 0) : value }
        : item),
    }));
  }

  function handleRemovePurchaseItem(index) {
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleCreatePurchaseReceipt(event) {
    event.preventDefault();

    if (!purchaseForm.items.length) {
      setErrorMessage('Phải có ít nhất một sản phẩm trong phiếu nhập.');
      return;
    }

    const defaultSupplierId = purchaseForm.supplierId || purchaseForm.items[0]?.supplierId || purchaseForm.items[0]?.ncc_ma || 0;
    if (!defaultSupplierId) {
      setErrorMessage('Sản phẩm này chưa có nhà cung cấp. Vui lòng cập nhật thông tin sản phẩm.');
      return;
    }

    setPurchaseForm((current) => ({
      ...current,
      supplierId: current.supplierId || String(defaultSupplierId),
    }));

    const invalidPriceItems = purchaseForm.items.filter((item) => {
      const importPrice = Number(item.unitPrice || 0);
      const salePrice = Number(item.salePrice || 0);
      return importPrice >= salePrice;
    });

    if (invalidPriceItems.length > 0) {
      setErrorMessage(`Giá nhập phải thấp hơn giá bán. Sản phẩm lỗi: ${invalidPriceItems.map((i) => i.name).join(', ')}`);
      return;
    }

    try {
      setErrorMessage('');
      const payload = {
        supplierId: Number(defaultSupplierId),
        employeeId: Number(getAuthUser()?.id || 1),
        date: purchaseForm.date,
        note: purchaseForm.note,
        items: purchaseForm.items.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
      };

      const receipt = await requestJson('/purchases', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setStatusMessage(`Đã tạo phiếu nhập ${receipt?.code || `PN${String(receipt?.id || '')}`}.`);
      setPurchaseForm({ supplierId: '', date: new Date().toISOString().slice(0, 10), note: '', items: [] });
      setPurchaseQuery('');
      setSelectedPurchaseId(String(receipt?.id || ''));
      const [nextReceipts, productsData] = await Promise.all([
        requestJson('/purchases', { method: 'GET' }).catch(() => []),
        requestJson('/products', { method: 'GET' }).catch(() => fallbackProducts),
      ]);
      setPurchaseReceipts(Array.isArray(nextReceipts) ? nextReceipts : []);
      setProducts(Array.isArray(productsData) ? productsData : fallbackProducts);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể tạo phiếu nhập.');
    }
  }

  function renderSectionContent() {
    function renderManagedField(collectionName, field) {
      const value = genericForms[collectionName]?.[field.name] ?? '';

      if (field.type === 'textarea') {
        return (
          <textarea
            rows="4"
            value={value}
            onChange={(event) => handleCollectionFieldChange(collectionName, field.name, event.target.value)}
            placeholder={field.placeholder || field.label}
          />
        );
      }

      if (field.type === 'boolean') {
        return (
          <select
            value={String(value)}
            onChange={(event) => handleCollectionFieldChange(collectionName, field.name, event.target.value)}
          >
            <option value="true">Đang khóa</option>
            <option value="false">Hoạt động</option>
          </select>
        );
      }

      if (field.type === 'select') {
        const nextValue = value || field.options?.[0] || '';

        return (
          <select
            value={nextValue}
            onChange={(event) => handleCollectionFieldChange(collectionName, field.name, event.target.value)}
          >
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      }

      return (
        <input
          type={field.type || 'text'}
          value={value}
          onChange={(event) => handleCollectionFieldChange(collectionName, field.name, event.target.value)}
          placeholder={field.placeholder || field.label}
        />
      );
    }

    if (activeSection === 'dashboard') {
      const quickAccessLinks = [
        { key: 'products', label: 'Quản lý sản phẩm' },
        { key: 'categories', label: 'Quản lý danh mục' },
        { key: 'brands', label: 'Quản lý thương hiệu' },
        { key: 'orders', label: 'Quản lý đơn hàng' },
        { key: 'rentals', label: 'Quản lý thuê BoardGame' },
        { key: 'customers', label: 'Quản lý khách hàng' },
        { key: 'promotions', label: 'Quản lý Voucher' },
        { key: 'content_pages', label: 'Quản lý Blog' },
        { key: 'chat_messages', label: 'Quản lý Chat hỗ trợ' },
        { key: 'reports', label: 'Thống kê báo cáo' },
      ];

      return (
        <>
          <div className="admin-metric-grid">
            <article><strong>{summary?.customers ?? users.filter((user) => user.role === 'customer').length}</strong><span>Khách hàng</span></article>
            <article><strong>{summary?.employees ?? collections.employees?.length ?? 0}</strong><span>Nhân viên</span></article>
            <article><strong>{summary?.products ?? products.length}</strong><span>Sản phẩm</span></article>
            <article><strong>{summary?.orders ?? orders.length}</strong><span>Đơn hàng</span></article>
            <article><strong>{summary?.rentals ?? rentalRows.length}</strong><span>Đơn thuê</span></article>
            <article><strong>{formatMoney(summary?.revenue ?? 0)}</strong><span>Doanh thu</span></article>
            <article><strong>{pendingOrderRows.length}</strong><span>Đơn chờ xác nhận</span></article>
            <article><strong>{lowStockProductRows.length}</strong><span>Sắp hết hàng</span></article>
            <article><strong>{activeVoucherRows.length}</strong><span>Voucher hoạt động</span></article>
            <article><strong>{pendingChatSessionRows.length}</strong><span>Hội thoại chờ hỗ trợ</span></article>
          </div>

          <div className="admin-card-grid">
            <article className="admin-card">
              <h3>Đơn hàng mới nhất</h3>
              <div className="admin-item-list">
                {recentOrders.length > 0 ? recentOrders.map((order) => (
                  <article key={order.id} className="admin-item-row">
                    <strong>{order.id}</strong>
                    <span>{order.customerName}</span>
                    <span>{order.totalLabel} | {order.statusLabel}</span>
                  </article>
                )) : <p>Chưa có đơn hàng để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Đơn thuê mới nhất</h3>
              <div className="admin-item-list">
                {recentRentals.length > 0 ? recentRentals.map((rental) => (
                  <article key={rental.id} className="admin-item-row">
                    <strong>{rental.rentalNumber}</strong>
                    <span>{rental.customerName}</span>
                    <span>{rental.totalLabel} | {rental.paymentStatusLabel}</span>
                  </article>
                )) : <p>Chưa có đơn thuê để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Top BoardGame bán chạy</h3>
              <div className="admin-item-list">
                {featuredProducts.length > 0 ? featuredProducts.map((product) => (
                  <article key={product.id} className="admin-item-row">
                    <strong>{product.name}</strong>
                    <span>Đã bán: {product.soldLabel}</span>
                    <span>Tồn kho: {product.stockLabel} | Đánh giá: {product.ratingLabel}</span>
                  </article>
                )) : <p>Chưa có dữ liệu sản phẩm để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Khách hàng mới đăng ký</h3>
              <div className="admin-item-list">
                {recentCustomerRows.length > 0 ? recentCustomerRows.map((customer) => (
                  <article key={customer.id} className="admin-item-row">
                    <strong>{customer.fullName}</strong>
                    <span>{customer.email}</span>
                  </article>
                )) : <p>Chưa có khách hàng mới để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Đánh giá mới</h3>
              <div className="admin-item-list">
                {recentReviewRows.length > 0 ? recentReviewRows.map((review) => (
                  <article key={review.id} className="admin-item-row">
                    <strong>{review.customerName}</strong>
                    <span>{review.productName} | {review.rating} ★</span>
                  </article>
                )) : <p>Chưa có đánh giá mới để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Hội thoại hỗ trợ mới</h3>
              <div className="admin-item-list">
                {recentChatSessionRows.length > 0 ? recentChatSessionRows.map((session) => (
                  <article key={session.id} className="admin-item-row">
                    <strong>{session.customerName}</strong>
                    <span>{session.statusLabel}</span>
                  </article>
                )) : <p>Chưa có hội thoại hỗ trợ để hiển thị.</p>}
              </div>
            </article>
            <article className="admin-card">
              <h3>Thông báo dành cho nhân viên</h3>
              <div className="admin-item-list">
                {dashboardNotifications.length > 0 ? dashboardNotifications.map((notification) => (
                  <article key={notification} className="admin-item-row"><span>{notification}</span></article>
                )) : <p>Không có thông báo mới.</p>}
              </div>
            </article>
          </div>

          <div className="admin-card">
            <h3>Truy cập nhanh</h3>
            <div className="admin-quick-access-grid">
              {quickAccessLinks.map((link) => (
                <button key={link.key} type="button" className="secondary-button" onClick={() => setActiveSection(link.key)}>{link.label}</button>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (activeSection === 'products') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý sản phẩm</p>
              <h2>{editingProductId ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm BoardGame'}</h2>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleProductSubmit}>
            {[
              ['name', 'Tên sản phẩm'],
              ['category', 'Danh mục'],
              ['brand', 'Thương hiệu'],
              ['publisher', 'Nhà phát hành'],
              ['stock', 'Tồn kho'],
              ['players', 'Số người chơi'],
              ['age', 'Độ tuổi phù hợp'],
              ['playTime', 'Thời gian chơi'],
              ['price', 'Giá bán'],
              ['discount', 'Giảm giá (%)'],
              ['rating', 'Đánh giá'],
              ['reviews', 'Số lượt đánh giá'],
              ['image', 'Hình ảnh'],
              ['labels', 'Nhãn hiển thị'],
            ].map(([name, label]) => (
              <label key={name} className={name === 'description' ? 'span-2' : ''}>
                {label}
                {name === 'category' ? (
                  <select name="category" value={productForm.category} onChange={handleProductChange}>
                    {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : name === 'brand' ? (
                  <select
                    name="brand"
                    value={productForm.brand}
                    onChange={(event) => {
                      const nextBrand = event.target.value;
                      setProductForm((current) => ({
                        ...current,
                        brand: nextBrand,
                        publisher: nextBrand || current.publisher,
                      }));
                    }}
                  >
                    <option value="">Chọn thương hiệu</option>
                    {brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input name={name} value={productForm[name]} onChange={handleProductChange} placeholder={label} />
                )}
              </label>
            ))}
            <label className="span-2">
              Mô tả
              <textarea name="description" value={productForm.description} onChange={handleProductChange} rows="4" placeholder="Mô tả chi tiết sản phẩm" />
            </label>
            <div className="span-2 admin-form-actions">
              <button className="primary-button" type="submit">{editingProductId ? 'Cập nhật' : 'Thêm mới'}</button>
              {editingProductId ? <button className="secondary-button" type="button" onClick={() => { setEditingProductId(null); setProductForm(productInitialState); }}>Hủy chỉnh sửa</button> : null}
            </div>
          </form>

          <div className="admin-table-card">
            <h3>Danh sách sản phẩm</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Danh mục</th>
                    <th>Giá</th>
                    <th>Tồn kho</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category}</td>
                      <td>{Number(product.price || 0).toLocaleString('vi-VN')} đ</td>
                      <td>{product.stock ?? 0}</td>
                      <td className="admin-row-actions">
                        <button type="button" className="secondary-button" onClick={() => populateProductForm(product)}>Sửa</button>
                        <button type="button" className="danger-button" onClick={() => handleDeleteProduct(product.id)}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    if (activeSection === 'orders') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý đơn hàng</p>
              <h2>Quản lý đơn hàng</h2>
              <p>Tra cứu, lọc theo trạng thái, xem chi tiết và cập nhật tiến trình xử lý của từng đơn.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo mã đơn, tên khách hàng hoặc số điện thoại"
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
            />
            <select className="admin-select" value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}>
              {orderStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="admin-management-layout">
            <div className="admin-table-card">
              <h3>Bảng danh sách đơn hàng</h3>
              <div className="admin-table-wrap">
                <table className="admin-table admin-order-table">
                  <thead>
                    <tr>
                      <th>Mã đơn hàng</th>
                      <th>Khách hàng</th>
                      <th>Ngày đặt</th>
                      <th>Tổng tiền</th>
                      <th>Thanh toán</th>
                      <th>Vận chuyển</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrderRows.map((order) => (
                      <tr key={order.id} className={String(selectedOrder?.id) === String(order.id) ? 'is-selected' : ''}>
                        <td>{order.id}</td>
                        <td>{order.customerName}</td>
                        <td>{formatDateTime(order.dh_thoigiandathang || order.createdAt || order.date || '-')}</td>
                        <td>{order.totalLabel}</td>
                        <td>{order.paymentLabel}</td>
                        <td>{order.shippingLabel}</td>
                        <td><span className="status-pill">{order.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => setSelectedOrderId(String(order.id))}>Chi tiết</button>
                          {orderStatusOptions.slice(1).map((status) => (
                            <button key={status} type="button" className="secondary-button" onClick={() => handleOrderStatusChange(order, status)}>{status}</button>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Chi tiết đơn hàng</p>
                  <h3>{selectedOrder ? selectedOrder.id : 'Chưa có đơn hàng'}</h3>
                </div>
              </div>

              {selectedOrder ? (
                <>
                  <div className="admin-detail-grid">
                    <div><span>Khách hàng</span><strong>{selectedOrder.customerName}</strong></div>
                    <div><span>Ngày đặt</span><strong>{formatDateTime(selectedOrder.dh_thoigiandathang || selectedOrder.createdAt || '-')}</strong></div>
                    <div><span>Thanh toán</span><strong>{selectedOrder.paymentLabel}</strong></div>
                    <div><span>Vận chuyển</span><strong>{selectedOrder.shippingLabel}</strong></div>
                    <div><span>Voucher</span><strong>{selectedOrder.voucherCode || selectedOrder.voucher || 'Chưa áp dụng'}</strong></div>
                    <div><span>Tổng tiền</span><strong>{selectedOrder.totalLabel}</strong></div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Danh sách sản phẩm</h4>
                    <div className="admin-item-list">
                      {selectedOrder.detailItems.map((item, index) => (
                        <article key={`${item.name || item.productName || index}`} className="admin-item-row">
                          <strong>{item.name || item.productName || item.title || `Sản phẩm ${index + 1}`}</strong>
                          <span>Số lượng: {item.quantity || item.ctdh_soluong || 1}</span>
                          <span>Đơn giá: {formatMoney(item.price || item.ctdh_dongia || 0)}</span>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Trạng thái xử lý</h4>
                    <div className="admin-timeline">
                      {buildOrderTimeline(selectedOrder.statusLabel).map((step) => (
                        <div key={step.key} className={`admin-timeline-item ${step.state}`}>
                          <div className="admin-timeline-marker" />
                          <div className="admin-timeline-content">
                            <strong>{step.label}</strong>
                            {step.state === 'current' ? <span>{selectedOrder.update || 'Đơn hàng đang được xử lý.'}</span> : null}
                            {step.state === 'current' ? <span>{selectedOrder.eta || 'Nhân viên sẽ cập nhật tiếp theo.'}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p>Không có dữ liệu đơn hàng để hiển thị.</p>
              )}
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'rentals') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý đơn thuê</p>
              <h2>Quản lý đơn thuê</h2>
              <p>Theo dõi tiến trình thuê board game từ xác nhận, giao nhận đến hoàn cọc và hoàn thành đơn.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo mã đơn thuê hoặc tên khách hàng"
              value={rentalQuery}
              onChange={(event) => setRentalQuery(event.target.value)}
            />
            <select className="admin-select" value={rentalStatusFilter} onChange={(event) => setRentalStatusFilter(event.target.value)}>
              {rentalStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="admin-management-layout">
            <div className="admin-table-card">
              <h3>Bảng danh sách đơn thuê</h3>
              <div className="admin-table-wrap">
                <table className="admin-table admin-order-table">
                  <thead>
                    <tr>
                      <th>Mã đơn thuê</th>
                      <th>Khách hàng</th>
                      <th>Ngày nhận</th>
                      <th>Ngày trả</th>
                      <th>Tiền cọc</th>
                      <th>Tổng thanh toán</th>
                      <th>TT thanh toán</th>
                      <th>TT đơn thuê</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRentalRows.map((rental) => (
                      <tr key={rental.id} className={String(selectedRental?.id) === String(rental.id) ? 'is-selected' : ''}>
                        <td>{rental.rentalNumber}</td>
                        <td>{rental.customerName}</td>
                        <td>{rental.receiveDate}</td>
                        <td>{rental.returnDate}</td>
                        <td>{rental.depositLabel}</td>
                        <td>{rental.totalLabel}</td>
                        <td><span className="status-pill">{rental.paymentStatusLabel}</span></td>
                        <td><span className="status-pill">{rental.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => setSelectedRentalId(String(rental.id))}>Chi tiết</button>
                          <button type="button" className="secondary-button" onClick={() => handleRentalStatusChange(rental, 'Đã xác nhận')}>Xác nhận</button>
                          <button type="button" className="secondary-button" onClick={() => handleRentalStatusChange(rental, 'Đã trả hàng', 'Đã hoàn cọc')}>Xác nhận trả hàng</button>
                          <button type="button" className="secondary-button" onClick={() => handleRentalStatusChange(rental, 'Hoàn thành')}>Hoàn thành</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Chi tiết đơn thuê</p>
                  <h3>{selectedRental ? selectedRental.rentalNumber : 'Chưa có đơn thuê'}</h3>
                </div>
              </div>

              {selectedRental ? (
                <>
                  <div className="admin-detail-grid">
                    <div><span>Khách hàng</span><strong>{selectedRental.customerName}</strong></div>
                    <div><span>Ngày nhận</span><strong>{selectedRental.receiveDate || '-'}</strong></div>
                    <div><span>Ngày trả</span><strong>{selectedRental.returnDate || '-'}</strong></div>
                    <div><span>Ngày trả thực tế</span><strong>{selectedRental.actualReturnDate || '-'}</strong></div>
                    <div><span>Địa chỉ giao hàng</span><strong>{selectedRental.address || 'Chưa cập nhật'}</strong></div>
                    <div><span>Thanh toán</span><strong>{selectedRental.paymentLabel}</strong></div>
                    <div><span>Đơn vị vận chuyển</span><strong>{selectedRental.shippingLabel}</strong></div>
                    <div><span>Voucher</span><strong>{selectedRental.voucherCode || 'Không áp dụng'}</strong></div>
                    <div><span>Tiền thuê</span><strong>{formatMoney(selectedRental.totalRentalFee || 0)}</strong></div>
                    <div><span>Tiền cọc</span><strong>{formatMoney(selectedRental.totalDeposit || 0)}</strong></div>
                    <div><span>Tổng thanh toán</span><strong>{selectedRental.totalLabel}</strong></div>
                    <div><span>Trạng thái thanh toán</span><strong>{selectedRental.paymentStatusLabel}</strong></div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Danh sách board game thuê</h4>
                    <div className="admin-item-list">
                      {(selectedRental.detailItems || []).map((item, index) => (
                        <article key={`${item.name || item.productName || index}`} className="admin-item-row">
                          <strong>{item.name || item.productName || item.title || `BoardGame ${index + 1}`}</strong>
                          <span>Số lượng: {item.quantity || item.ctdt_soluong || 1}</span>
                          <span>Số ngày thuê: {item.rentalDays || selectedRental.rentalDays || 1}</span>
                          <span>Giá thuê/ngày: {formatMoney(item.rentalPricePerDay || item.ctdt_giathuengay || 0)}</span>
                          <span>Tiền cọc: {formatMoney(item.depositPerItem || item.ctdt_tiencoc || 0)}</span>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Cập nhật trạng thái</h4>
                    <div className="admin-chip-row">
                      {rentalStatusOptions.slice(1).map((status) => (
                        <button key={status} type="button" className="secondary-button" onClick={() => handleRentalStatusChange(selectedRental, status)}>{status}</button>
                      ))}
                    </div>
                    <div className="admin-chip-row">
                      {rentalPaymentStatusOptions.map((paymentStatus) => (
                        <button key={paymentStatus} type="button" className="secondary-button" onClick={() => handleRentalStatusChange(selectedRental, selectedRental.statusLabel, paymentStatus)}>{paymentStatus}</button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p>Không có dữ liệu đơn thuê để hiển thị.</p>
              )}
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'reviews') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý đánh giá</p>
              <h2>Quản lý đánh giá</h2>
              <p>Kiểm duyệt đánh giá theo sản phẩm, khách hàng, số sao và trạng thái hiển thị.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo sản phẩm hoặc khách hàng"
              value={reviewQuery}
              onChange={(event) => setReviewQuery(event.target.value)}
            />
            <select className="admin-select" value={reviewRatingFilter} onChange={(event) => setReviewRatingFilter(event.target.value)}>
              {['Tất cả', '1', '2', '3', '4', '5'].map((stars) => (
                <option key={stars} value={stars}>{stars === 'Tất cả' ? stars : `${stars} sao`}</option>
              ))}
            </select>
            <select className="admin-select" value={reviewStatusFilter} onChange={(event) => setReviewStatusFilter(event.target.value)}>
              {reviewStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="admin-management-layout">
            <div className="admin-table-card">
              <h3>Bảng danh sách đánh giá</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã đánh giá</th>
                      <th>Khách hàng</th>
                      <th>Sản phẩm</th>
                      <th>Số sao</th>
                      <th>Nội dung</th>
                      <th>Ngày đánh giá</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReviewRows.map((review) => (
                      <tr key={review.id} className={String(selectedReview?.id) === String(review.id) ? 'is-selected' : ''}>
                        <td>{review.reviewCode}</td>
                        <td>{review.customerName}</td>
                        <td>{review.productName}</td>
                        <td>{review.rating} ★</td>
                        <td>{review.content}</td>
                        <td>{new Date(review.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td><span className="status-pill">{review.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => setSelectedReviewId(String(review.id))}>Xem chi tiết</button>
                          <button type="button" className="secondary-button" onClick={() => handleReviewStatusChange(review, 'Hiển thị')}>Duyệt</button>
                          <button type="button" className="secondary-button" onClick={() => handleReviewStatusChange(review, 'Ẩn')}>Ẩn</button>
                          <button type="button" className="danger-button" onClick={() => handleDeleteReview(review.id)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Chi tiết đánh giá</p>
                  <h3>{selectedReview ? selectedReview.reviewCode : 'Chưa có đánh giá'}</h3>
                </div>
              </div>

              {selectedReview ? (
                <>
                  <div className="admin-detail-grid">
                    <div><span>Khách hàng</span><strong>{selectedReview.customerName}</strong></div>
                    <div><span>Email</span><strong>{selectedReview.customerEmail || '-'}</strong></div>
                    <div><span>Sản phẩm</span><strong>{selectedReview.productName}</strong></div>
                    <div><span>Mã đơn hàng</span><strong>{selectedReview.orderId || '-'}</strong></div>
                    <div><span>Trạng thái đơn</span><strong>{selectedReview.orderStatus || '-'}</strong></div>
                    <div><span>Số sao</span><strong>{selectedReview.rating} ★</strong></div>
                    <div><span>Ngày đánh giá</span><strong>{new Date(selectedReview.createdAt).toLocaleString('vi-VN')}</strong></div>
                    <div><span>Trạng thái hiện tại</span><strong>{selectedReview.statusLabel}</strong></div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Nội dung đánh giá</h4>
                    <article className="admin-item-row">
                      <p>{selectedReview.content}</p>
                    </article>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Thao tác kiểm duyệt</h4>
                    <div className="admin-chip-row">
                      <button type="button" className="secondary-button" onClick={() => handleReviewStatusChange(selectedReview, 'Hiển thị')}>Duyệt</button>
                      <button type="button" className="secondary-button" onClick={() => handleReviewStatusChange(selectedReview, 'Ẩn')}>Ẩn</button>
                      <button type="button" className="danger-button" onClick={() => handleDeleteReview(selectedReview.id)}>Xóa</button>
                    </div>
                  </div>
                </>
              ) : (
                <p>Không có dữ liệu đánh giá để hiển thị.</p>
              )}
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'customers') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý khách hàng</p>
              <h2>Quản lý khách hàng</h2>
              <p>Theo dõi thông tin cá nhân, trạng thái kích hoạt, lịch sử mua thuê và voucher của khách hàng.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo tên, email hoặc số điện thoại"
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
            />
            <select className="admin-select" value={customerStatusFilter} onChange={(event) => setCustomerStatusFilter(event.target.value)}>
              {['Tất cả', 'Hoạt động', 'Đang khóa'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="admin-management-layout admin-management-layout-wide">
            <div className="admin-table-card">
              <h3>Bảng danh sách khách hàng</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã khách hàng</th>
                      <th>Họ tên</th>
                      <th>Email</th>
                      <th>Số điện thoại</th>
                      <th>Điểm thành viên</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomerRows.map((customer) => (
                      <tr key={customer.id} className={String(selectedCustomer?.id) === String(customer.id) ? 'is-selected' : ''}>
                        <td>{customer.id}</td>
                        <td>{customer.fullName}</td>
                        <td>{customer.email}</td>
                        <td>{customer.phone}</td>
                        <td>{customer.pointLabel}</td>
                        <td><span className="status-pill">{customer.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => setSelectedCustomerId(String(customer.id))}>Chi tiết</button>
                          <button type="button" className="secondary-button" onClick={() => handleToggleCustomerLock(customer)}>{customer.isLocked ? 'Mở khóa' : 'Khóa'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Chi tiết khách hàng</p>
                  <h3>{selectedCustomer ? selectedCustomer.fullName : 'Chưa chọn khách hàng'}</h3>
                </div>
              </div>

              {selectedCustomer ? (
                <>
                  <div className="admin-detail-grid">
                    <div><span>Email</span><strong>{selectedCustomer.email}</strong></div>
                    <div><span>Số điện thoại</span><strong>{selectedCustomer.phone}</strong></div>
                    <div><span>Điểm thành viên</span><strong>{selectedCustomer.pointLabel}</strong></div>
                    <div>
                      <span>Địa chỉ</span>
                      <div className="admin-address-list">
                        {Array.isArray(selectedCustomer.addresses) && selectedCustomer.addresses.length > 0 ? (
                          selectedCustomer.addresses.map((address) => (
                            <div key={String(address.id || address.addressLine)} className="admin-address-item">
                              <strong>{address.addressLine}</strong>
                              <div className="admin-address-subtext">
                                {address.recipientName ? `${address.recipientName} • ` : ''}{address.phone}{address.isDefault ? ' • Địa chỉ mặc định' : ''}
                              </div>
                            </div>
                          ))
                        ) : (
                          <strong>{selectedCustomer.address}</strong>
                        )}
                      </div>
                    </div>
                    <div className="admin-status-activation"><span>Trạng thái kích hoạt</span><strong>{selectedCustomer.activationStatus}</strong></div>
                    <div className="admin-status-account"><span>Trạng thái tài khoản</span><strong>{selectedCustomer.statusLabel}</strong></div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Lịch sử hoạt động</h4>
                    <div className="admin-stat-row">
                      <article><strong>{selectedCustomer.orderCount}</strong><span>Đơn mua</span></article>
                      <article><strong>{selectedCustomer.rentalCount}</strong><span>Đơn thuê</span></article>
                      <article><strong>{selectedCustomer.voucherCount}</strong><span>Voucher</span></article>
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h4>Thao tác nhanh</h4>
                    <div className="admin-chip-row">
                      <button type="button" className="secondary-button" onClick={() => setSelectedCustomerId(String(selectedCustomer.id))}>Xem chi tiết</button>
                      <button type="button" className="secondary-button" onClick={() => handleToggleCustomerLock(selectedCustomer)}>{selectedCustomer.isLocked ? 'Mở khóa' : 'Khóa'}</button>
                      <button type="button" className="secondary-button" onClick={() => handleResetCustomerPassword(selectedCustomer)}>Cấp lại mật khẩu</button>
                    </div>
                    {String(resetPasswordForId) === String(selectedCustomer.id) ? (
                      <form className="admin-reset-password-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSubmitResetPassword(); }}>
                        <label>Mật khẩu mới</label>
                        <input name="new-password" autoComplete="new-password" type="password" value={resetPasswordValue} onChange={(e) => setResetPasswordValue(e.target.value)} />
                        <label>Xác nhận mật khẩu</label>
                        <input name="confirm-password" autoComplete="new-password" type="password" value={resetPasswordConfirm} onChange={(e) => setResetPasswordConfirm(e.target.value)} />
                        {resetPasswordError ? <div className="form-error">{resetPasswordError}</div> : null}
                        <div className="admin-reset-actions">
                          <button type="submit" className="primary-button" disabled={resetPasswordLoading}>{resetPasswordLoading ? 'Đang gửi...' : 'Xác nhận'}</button>
                          <button type="button" className="secondary-button" onClick={handleCancelResetPassword} disabled={resetPasswordLoading}>Hủy</button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </>
              ) : null}
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'employees') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý nhân viên</p>
              <h2>Quản lý tài khoản nhân viên</h2>
              <p>Thêm, cập nhật, khóa hoặc gán quyền cho nhân viên trong hệ thống.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo tên hoặc email"
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.target.value)}
            />
            <select className="admin-select" value={employeeStatusFilter} onChange={(event) => setEmployeeStatusFilter(event.target.value)}>
              {['Tất cả', 'Hoạt động', 'Tạm khóa'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="admin-management-layout admin-management-layout-wide">
            <div className="admin-table-card">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Danh sách nhân viên</p>
                  <h3>Quản lý tài khoản nhân viên</h3>
                </div>
                <button type="button" className="primary-button" onClick={() => { setEditingCollection(null); setActiveSection('employees'); }}>Thêm nhân viên</button>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã nhân viên</th>
                      <th>Họ tên</th>
                      <th>Email</th>
                      <th>Số điện thoại</th>
                      <th>Quyền</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployeeRows.map((employee) => (
                      <tr key={employee.id} className={String(selectedEmployee?.id) === String(employee.id) ? 'is-selected' : ''}>
                        <td>{employee.id}</td>
                        <td>{employee.fullName}</td>
                        <td>{employee.email}</td>
                        <td>{employee.phone}</td>
                        <td>{employee.roleLabel}</td>
                        <td><span className="status-pill">{employee.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => { setSelectedEmployeeId(String(employee.id)); populateCollectionForm('employees', employee); }}>Chỉnh sửa</button>
                          <button type="button" className="danger-button" onClick={() => handleDeleteCollectionItem('employees', employee._id || employee.id)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Biểu mẫu nhân viên</p>
                  <h3>{editingCollection?.collectionName === 'employees' ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}</h3>
                </div>
              </div>

              <div className="admin-detail-section">
                {selectedEmployee ? (
                  <div className="admin-detail-grid compact-grid">
                    <div><span>Họ tên</span><strong>{selectedEmployee.fullName}</strong></div>
                    <div><span>Email</span><strong>{selectedEmployee.email}</strong></div>
                    <div><span>Số điện thoại</span><strong>{selectedEmployee.phone}</strong></div>
                    <div><span>Quyền</span><strong>{selectedEmployee.roleLabel}</strong></div>
                    <div><span>Trạng thái</span><strong>{selectedEmployee.statusLabel}</strong></div>
                    <div><span>Ngày sinh</span><strong>{selectedEmployee.birthDate || '-'}</strong></div>
                  </div>
                ) : null}
              </div>

              <form className="admin-form compact-form" onSubmit={(event) => handleCollectionSubmit('employees', event)}>
                {collectionConfigs.employees.fields.map((field) => (
                  <label key={field.name} className={field.type === 'textarea' ? 'span-2' : ''}>
                    {field.label}
                    {renderManagedField('employees', field)}
                  </label>
                ))}
                <div className="span-2 admin-form-actions">
                  <button className="primary-button" type="submit">{editingCollection?.collectionName === 'employees' ? 'Cập nhật' : 'Lưu'}</button>
                  {editingCollection?.collectionName === 'employees' ? <button className="secondary-button" type="button" onClick={() => setEditingCollection(null)}>Hủy chỉnh sửa</button> : null}
                </div>
              </form>
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'categories') {
      const activeCategory = filteredCategoryRows.find((item) => String(item.id) === String(selectedCategoryId || editingCollection?.documentId)) || filteredCategoryRows[0] || null;
      const linkedProducts = products.filter((product) => matchesCategoryProduct(product, activeCategory));

      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý danh mục</p>
              <h2>Quản lý danh mục</h2>
              <p>Theo dõi loại board game, số lượng sản phẩm và trạng thái sử dụng trong hệ thống.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo tên danh mục"
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
            />
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingCollection(null);
                setGenericForms((current) => ({ ...current, categories: genericInitialState.categories }));
              }}
            >
              Thêm danh mục
            </button>
          </div>

          <div className="admin-management-layout admin-management-layout-wide">
            <div className="admin-table-card">
              <h3>Bảng danh sách danh mục</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã danh mục</th>
                      <th>Tên danh mục</th>
                      <th>Slug</th>
                      <th>Số lượng sản phẩm</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategoryRows.map((item) => (
                      <tr key={item.id} className={String(activeCategory?.id) === String(item.id) ? 'is-selected' : ''}>
                        <td>{item.id}</td>
                        <td>{item.name}</td>
                        <td>{item.slug}</td>
                        <td>{item.productCount}</td>
                        <td><span className="status-pill">{item.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => populateCollectionForm('categories', item)}>Chỉnh sửa</button>
                          <button type="button" className="danger-button" onClick={() => handleDeleteCollectionItem('categories', item._id || item.id)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Biểu mẫu danh mục</p>
                  <h3>{editingCollection?.collectionName === 'categories' ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}</h3>
                </div>
              </div>

              <form className="admin-form compact-form" onSubmit={(event) => handleCollectionSubmit('categories', event)}>
                {collectionConfigs.categories.fields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {renderManagedField('categories', field)}
                  </label>
                ))}
                <div className="admin-form-actions">
                  <button className="primary-button" type="submit">Lưu</button>
                  {editingCollection?.collectionName === 'categories' ? <button className="secondary-button" type="button" onClick={() => setEditingCollection(null)}>Hủy chỉnh sửa</button> : null}
                </div>
              </form>

              <div className="admin-detail-section">
                <h4>Sản phẩm thuộc danh mục</h4>
                <div className="admin-item-list">
                  {linkedProducts.length > 0 ? linkedProducts.map((product) => (
                    <article key={product.id} className="admin-item-row">
                      <strong>{product.name}</strong>
                      <span>{product.category}</span>
                    </article>
                  )) : <p>Chưa có sản phẩm thuộc danh mục này.</p>}
                </div>
              </div>
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'brands') {
      const activeBrand = filteredBrandRows.find((item) => String(item.id) === String(selectedBrandId || editingCollection?.documentId)) || filteredBrandRows[0] || null;
      const linkedProducts = products.filter((product) => matchesBrandProduct(product, activeBrand));

      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý thương hiệu</p>
              <h2>Quản lý thương hiệu</h2>
              <p>Quản lý nhà xuất bản, quốc gia, website và các sản phẩm đang thuộc từng thương hiệu.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo tên nhà xuất bản"
              value={brandQuery}
              onChange={(event) => setBrandQuery(event.target.value)}
            />
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingCollection(null);
                setSelectedBrandId('');
                setGenericForms((current) => ({ ...current, brands: genericInitialState.brands }));
              }}
            >
              Thêm thương hiệu
            </button>
          </div>

          <div className="admin-management-layout admin-management-layout-wide">
            <div className="admin-table-card">
              <h3>Bảng danh sách nhà xuất bản</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã nhà xuất bản</th>
                      <th>Tên nhà xuất bản</th>
                      <th>Quốc gia</th>
                      <th>Website</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrandRows.map((item) => (
                      <tr key={item.id} className={String(activeBrand?.id) === String(item.id) ? 'is-selected' : ''}>
                        <td>{item.id}</td>
                        <td>{item.name}</td>
                        <td>{item.country}</td>
                        <td>{item.website}</td>
                        <td><span className="status-pill">{item.statusLabel}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => populateCollectionForm('brands', item)}>Chỉnh sửa</button>
                          <button type="button" className="danger-button" onClick={() => handleDeleteCollectionItem('brands', item._id || item.id)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Biểu mẫu thương hiệu</p>
                  <h3>{editingCollection?.collectionName === 'brands' ? 'Chỉnh sửa thương hiệu' : 'Thêm thương hiệu mới'}</h3>
                </div>
              </div>

              <form className="admin-form compact-form" onSubmit={(event) => handleCollectionSubmit('brands', event)}>
                {collectionConfigs.brands.fields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {renderManagedField('brands', field)}
                  </label>
                ))}
                <div className="admin-form-actions">
                  <button className="primary-button" type="submit">Lưu</button>
                  {editingCollection?.collectionName === 'brands' ? <button className="secondary-button" type="button" onClick={() => setEditingCollection(null)}>Hủy chỉnh sửa</button> : null}
                </div>
              </form>

              <div className="admin-detail-section">
                <h4>Sản phẩm thuộc thương hiệu</h4>
                <div className="admin-item-list">
                  {linkedProducts.length > 0 ? linkedProducts.map((product) => (
                    <article key={product.id} className="admin-item-row">
                      <strong>{product.name}</strong>
                      <span>{product.publisher || product.brand || 'Chưa gán thương hiệu'}</span>
                    </article>
                  )) : <p>Chưa có sản phẩm thuộc thương hiệu này.</p>}
                </div>
              </div>
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'promotions') {
      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quản lý khuyến mãi</p>
              <h2>Quản lý Voucher công khai và riêng tư</h2>
              <p>Tạo, chỉnh sửa, khóa, cấp voucher cho khách hàng và theo dõi lượt sử dụng theo thời gian thực.</p>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <input
              className="admin-search"
              type="search"
              placeholder="Tìm theo mã hoặc tên voucher"
              value={voucherQuery}
              onChange={(event) => setVoucherQuery(event.target.value)}
            />
            <select className="admin-select" value={voucherStatusFilter} onChange={(event) => setVoucherStatusFilter(event.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="expired">Hết hạn</option>
              <option value="locked">Đã khóa</option>
              <option value="scheduled">Sắp diễn ra</option>
              <option value="out_of_stock">Hết lượt</option>
            </select>
            <select className="admin-select" value={voucherTypeFilter} onChange={(event) => setVoucherTypeFilter(event.target.value)}>
              <option value="all">Tất cả loại voucher</option>
              <option value="public">Công khai</option>
              <option value="private">Riêng tư</option>
            </select>
            <button type="button" className="primary-button" onClick={() => resetVoucherEditor()}>Thêm voucher</button>
          </div>

          <div className="admin-management-layout admin-management-layout-wide">
            <div className="admin-table-card">
              <h3>Danh sách voucher</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã Voucher</th>
                      <th>Tên Voucher</th>
                      <th>Loại</th>
                      <th>Giá trị giảm</th>
                      <th>Điều kiện</th>
                      <th>Hiệu lực</th>
                      <th>Số lượng</th>
                      <th>Đã dùng</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVoucherRows.map((voucher) => (
                      <tr key={voucher.id} className={String(selectedVoucher?.id) === String(voucher.id) ? 'is-selected' : ''}>
                        <td>{voucher.code}</td>
                        <td>{voucher.title}</td>
                        <td>{getVoucherScopeLabel(voucher.scope)}</td>
                        <td>{formatVoucherValue(voucher)}</td>
                        <td>Tối thiểu {formatMoney(voucher.minAmount || 0)}</td>
                        <td>{voucher.startDate ? String(voucher.startDate).slice(0, 10) : '-'} - {voucher.endDate ? String(voucher.endDate).slice(0, 10) : '-'}</td>
                        <td>{voucher.quantity || 0}</td>
                        <td>{voucher.usedCount || 0}</td>
                        <td><span className="status-pill">{getVoucherStatusLabel(voucher.status)}</span></td>
                        <td className="admin-row-actions">
                          <button type="button" className="secondary-button" onClick={() => { setSelectedVoucherId(String(voucher.id)); openVoucherEditor(voucher); }}>Sửa</button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleVoucherStatusChange(voucher, voucher.status === 'locked' ? 'active' : 'locked')}
                          >
                            {voucher.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                          </button>
                          <button type="button" className="danger-button" onClick={() => handleVoucherDelete(voucher)}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="admin-detail-card card-surface">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Biểu mẫu voucher</p>
                  <h3>{editingVoucherId ? 'Chỉnh sửa voucher' : 'Tạo voucher mới'}</h3>
                </div>
              </div>

              <form className="admin-form compact-form" onSubmit={handleVoucherSubmit}>
                <label>
                  Tên voucher
                  <input value={voucherForm.title} onChange={(event) => setVoucherForm((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label>
                  Mã voucher
                  <input value={voucherForm.code} onChange={(event) => setVoucherForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
                </label>
                <label>
                  Loại voucher
                  <select value={voucherForm.scope} onChange={(event) => setVoucherForm((current) => ({ ...current, scope: event.target.value }))}>
                    <option value="public">Công khai</option>
                    <option value="private">Riêng tư</option>
                  </select>
                </label>
                <label>
                  Hình thức giảm
                  <select value={String(voucherForm.discountType)} onChange={(event) => setVoucherForm((current) => ({ ...current, discountType: Number(event.target.value) }))}>
                    <option value="1">Theo phần trăm</option>
                    <option value="2">Theo số tiền</option>
                  </select>
                </label>
                <label>
                  Giá trị giảm
                  <input type="number" min="0" value={voucherForm.value} onChange={(event) => setVoucherForm((current) => ({ ...current, value: event.target.value }))} />
                </label>
                <label>
                  Giảm tối đa
                  <input type="number" min="0" value={voucherForm.maxDiscount} onChange={(event) => setVoucherForm((current) => ({ ...current, maxDiscount: event.target.value }))} />
                </label>
                <label>
                  Đơn tối thiểu
                  <input type="number" min="0" value={voucherForm.minAmount} onChange={(event) => setVoucherForm((current) => ({ ...current, minAmount: event.target.value }))} />
                </label>
                <label>
                  Số lượng phát hành
                  <input type="number" min="0" value={voucherForm.quantity} onChange={(event) => setVoucherForm((current) => ({ ...current, quantity: event.target.value }))} />
                </label>
                <label>
                  Ngày bắt đầu
                  <input type="date" value={voucherForm.startDate} onChange={(event) => setVoucherForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
                <label>
                  Ngày kết thúc
                  <input type="date" value={voucherForm.endDate} onChange={(event) => setVoucherForm((current) => ({ ...current, endDate: event.target.value }))} />
                </label>
                <label>
                  Số lần dùng/khách
                  <input type="number" min="1" value={voucherForm.maxUsesPerCustomer} onChange={(event) => setVoucherForm((current) => ({ ...current, maxUsesPerCustomer: Number(event.target.value || 1) }))} />
                </label>
                <label>
                  Trạng thái
                  <select value={voucherForm.status} onChange={(event) => setVoucherForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="active">Đang hoạt động</option>
                    <option value="locked">Đã khóa</option>
                  </select>
                </label>
                <label className="span-2">
                  Mô tả
                  <textarea rows="3" value={voucherForm.description} onChange={(event) => setVoucherForm((current) => ({ ...current, description: event.target.value }))} />
                </label>

                <div className="span-2 admin-form-actions">
                  <button className="primary-button" type="submit">{editingVoucherId ? 'Cập nhật voucher' : 'Tạo voucher'}</button>
                  {editingVoucherId ? <button className="secondary-button" type="button" onClick={() => resetVoucherEditor()}>Hủy chỉnh sửa</button> : null}
                </div>
              </form>

              {voucherForm.scope === 'private' ? (
                <div className="admin-detail-section">
                  <h4>Danh sách khách hàng nhận voucher</h4>
                  <div className="admin-toolbar">
                    <label>
                      Giới hạn số khách được cấp (0 = không giới hạn)
                      <input
                        className="admin-select"
                        type="number"
                        min="0"
                        value={voucherLimitCustomers}
                        onChange={(event) => setVoucherLimitCustomers(event.target.value)}
                      />
                    </label>
                    <label>
                      Số lần mỗi khách được dùng voucher
                      <input
                        className="admin-select"
                        type="number"
                        min="1"
                        value={voucherMaxUsesPerCustomer}
                        onChange={(event) => setVoucherMaxUsesPerCustomer(event.target.value)}
                      />
                    </label>
                  </div>

                  <p>Chọn trực tiếp khách hàng từ danh sách có sẵn trong CSDL:</p>

                  <div className="admin-item-list">
                    {filteredVoucherCustomers.map((customer) => {
                      const checked = selectedVoucherCustomers.includes(String(customer.id));
                      return (
                        <label key={customer.id} className="admin-item-row">
                          <input type="checkbox" checked={checked} onChange={() => toggleVoucherCustomer(customer.id)} />
                          <strong>{customer.fullName}</strong>
                          <span>{customer.email || customer.phone || `ID: ${customer.id}`}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="admin-form-actions">
                    {editingVoucherId || selectedVoucher?.id ? (
                      <button type="button" className="secondary-button" onClick={() => handleVoucherAssignCustomers(editingVoucherId || selectedVoucher.id)}>Lưu danh sách khách hàng</button>
                    ) : (
                      <span>Vui lòng lưu voucher trước, sau đó bấm "Lưu danh sách khách hàng" để gán voucher riêng tư.</span>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </section>
      );
    }

    if (activeSection === 'reports') {
      const monthlyRevenue = reportData?.revenue?.monthlyComparison || [];
      const monthlyOrders = reportData?.orders?.monthlyCount || [];
      const statusDistribution = reportData?.orders?.statusDistribution || [];
      const topSelling = reportData?.products?.topSelling || [];
      const outOfStock = reportData?.products?.outOfStock || [];
      const topCustomers = reportData?.customers?.topSpenders || [];
      const paymentMethods = reportData?.payments?.methods || [];
      const topVouchers = reportData?.promotions?.topVouchers || [];
      const hasReportData = Boolean(reportData);
      const reportPeriodPreset = reportPreset === 'today' ? 'day' : reportPreset;
      const reportDisplayRange = getReportRange(reportPeriodPreset === 'custom' ? 'custom' : reportPeriodPreset, reportDateCursor, reportStartDate, reportEndDate);
      const reportPeriodLabel = formatRangeLabel(reportPeriodPreset, reportDisplayRange);
      const reportPeriodName = {
        day: 'Ngày',
        week: 'Tuần',
        month: 'Tháng',
        year: 'Năm',
      }[reportPeriodPreset] || 'Tháng';

      const maxRevenue = Math.max(1, ...monthlyRevenue.map((item) => Number(item.revenue || 0)));
      const maxOrders = Math.max(1, ...monthlyOrders.map((item) => Number(item.count || 0)));
      const maxTopSelling = Math.max(1, ...topSelling.map((item) => Number(item.quantity || 0)));
      const totalStatus = Math.max(1, statusDistribution.reduce((sum, item) => sum + Number(item.value || 0), 0));

      const linePoints = monthlyRevenue
        .map((item, index) => {
          const x = monthlyRevenue.length > 1 ? (index / (monthlyRevenue.length - 1)) * 100 : 50;
          const y = 100 - ((Number(item.revenue || 0) / maxRevenue) * 100);
          return `${x},${y}`;
        })
        .join(' ');

      const pieSegments = [];
      let accumulatedPercent = 0;
      statusDistribution.forEach((item, index) => {
        const currentPercent = (Number(item.value || 0) / totalStatus) * 100;
        const start = accumulatedPercent;
        const end = accumulatedPercent + currentPercent;
        accumulatedPercent = end;
        const color = ['#111111', '#2f6f61', '#c15f26', '#d7263d', '#777777'][index % 5];
        pieSegments.push(`${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      });

      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Thống kê báo cáo</p>
              <h2>Thống kê - Báo cáo</h2>
            </div>
          </div>

          <div className="admin-toolbar card-surface">
            <select className="admin-select" value={reportPreset} onChange={(event) => {
              const nextPreset = event.target.value;
              setReportPreset(nextPreset);
              if (nextPreset !== 'custom' && nextPreset !== 'all') {
                setReportDateCursor(new Date());
              }
            }}>
              {reportPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            {reportPreset === 'custom' ? (
              <>
                <input className="admin-search" type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} />
                <input className="admin-search" type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} />
              </>
            ) : null}
            {(reportPreset === 'day' || reportPreset === 'week' || reportPreset === 'month' || reportPreset === 'year' || reportPreset === 'today') ? (
              <div className="admin-time-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" className="secondary-button" onClick={() => shiftReportPeriod(-1)}>{`< ${reportPeriodName}`}</button>
                <span>{reportPeriodLabel}</span>
                <button type="button" className="secondary-button" onClick={() => shiftReportPeriod(1)}>{`${reportPeriodName} >`}</button>
              </div>
            ) : (
              reportPreset === 'all' ? <span>{reportPeriodLabel}</span> : null
            )}
            <button type="button" className="secondary-button" onClick={loadReports}>Tải lại báo cáo</button>
            <button type="button" className="secondary-button" onClick={handleExportExcel} disabled={!hasReportData || reportLoading}>Xuất Excel</button>
            <button type="button" className="secondary-button" onClick={handleExportPdf} disabled={!hasReportData || reportLoading}>Xuất PDF</button>
            {reportLoading ? <span className="admin-report-loading">Đang tải báo cáo...</span> : null}
          </div>

          {!reportLoading && reportError ? <p className="admin-message error">{reportError}</p> : null}
          {!reportLoading && !reportError && !hasReportData ? <p className="admin-message info">Chưa có dữ liệu báo cáo trong khoảng thời gian đã chọn.</p> : null}

          {hasReportData ? (
            <>
              <div className="admin-card-grid">
                <article className="admin-card"><h3>Tổng doanh thu</h3><strong>{formatMoney(reportData.summary.totalRevenue || 0)}</strong></article>
                <article className="admin-card"><h3>Lợi nhuận thực tế</h3><strong>{formatMoney(reportData.summary.totalProfit || 0)}</strong></article>
                <article className="admin-card"><h3>Tổng đơn hàng</h3><strong>{reportData.summary.totalOrders || 0}</strong></article>
                <article className="admin-card"><h3>Tổng sản phẩm</h3><strong>{reportData.summary.totalProducts || 0}</strong></article>
              </div>

              <div className="admin-report-grid">
                <article className="admin-table-card">
                  <h3>Biểu đồ đường doanh thu theo tháng</h3>
                  <svg className="admin-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Doanh thu theo tháng">
                    <polyline fill="none" stroke="#c15f26" strokeWidth="2" points={linePoints || '0,100 100,100'} />
                  </svg>
                  <div className="admin-axis-labels">
                    {monthlyRevenue.map((item) => <span key={item.label}>{item.label}</span>)}
                  </div>
                </article>

                <article className="admin-table-card">
                  <h3>Biểu đồ cột đơn hàng theo tháng</h3>
                  <div className="admin-vertical-bars">
                    {monthlyOrders.map((item) => (
                      <div key={item.label} className="admin-vertical-bar-item">
                        <strong>{item.count}</strong>
                        <div className="admin-vertical-bar-track">
                          <div
                            className="admin-vertical-bar"
                            style={{ height: `${Math.max(8, (Number(item.count || 0) / maxOrders) * 100)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="admin-table-card">
                  <h3>Biểu đồ tròn trạng thái đơn hàng</h3>
                  <div className="admin-pie-wrap">
                    <div className="admin-pie-chart" style={{ background: `conic-gradient(${pieSegments.join(', ') || '#111 0% 100%'})` }} />
                    <div className="admin-pie-legend">
                      {statusDistribution.map((item) => <span key={item.label}>{item.label}: {item.value}</span>)}
                    </div>
                  </div>
                </article>

                <article className="admin-table-card">
                  <h3>Biểu đồ cột ngang Top 10 bán chạy</h3>
                  <div className="admin-horizontal-bars">
                    {topSelling.map((item) => (
                      <div key={item.productId} className="admin-horizontal-bar-item">
                        <span>{item.name}</span>
                        <div className="admin-horizontal-bar-track">
                          <div className="admin-horizontal-bar-fill" style={{ width: `${Math.max(4, (Number(item.quantity || 0) / maxTopSelling) * 100)}%` }} />
                        </div>
                        <strong>{item.quantity}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="admin-report-tables-grid">
                <div className="admin-table-card">
                  <h3>Thống kê đơn hàng theo trạng thái</h3>
                  <table className="admin-table">
                    <thead><tr><th>Trạng thái</th><th>Số lượng</th></tr></thead>
                    <tbody>{statusDistribution.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="admin-table-card">
                  <h3>Top 10 board game bán chạy</h3>
                  <table className="admin-table">
                    <thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Doanh thu</th></tr></thead>
                    <tbody>{topSelling.map((item) => <tr key={`top-${item.productId}`}><td>{item.name}</td><td>{item.quantity}</td><td>{formatMoney(item.revenue)}</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="admin-table-card">
                  <h3>Sản phẩm hết hàng</h3>
                  <table className="admin-table">
                    <thead><tr><th>Sản phẩm</th><th>Tồn kho</th></tr></thead>
                    <tbody>{outOfStock.map((item) => <tr key={`out-${item.productId}`}><td>{item.name}</td><td>{item.stock}</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="admin-table-card">
                  <h3>Top khách hàng chi tiêu cao</h3>
                  <table className="admin-table">
                    <thead><tr><th>Khách hàng</th><th>Tổng chi tiêu</th></tr></thead>
                    <tbody>{topCustomers.map((item) => <tr key={`cus-${item.userId}`}><td>{item.customerName}</td><td>{formatMoney(item.totalSpend)}</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="admin-table-card">
                  <h3>Thống kê thanh toán</h3>
                  <table className="admin-table">
                    <thead><tr><th>Phương thức</th><th>Số lượng</th><th>Tỷ lệ</th></tr></thead>
                    <tbody>{paymentMethods.map((item) => <tr key={`pay-${item.method}`}><td>{item.method}</td><td>{item.count}</td><td>{item.ratio}%</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="admin-table-card">
                  <h3>Thống kê voucher</h3>
                  <p>Doanh thu dùng voucher: <strong>{formatMoney(reportData.promotions.revenueWithVoucher || 0)}</strong></p>
                  <p>Tỷ lệ dùng voucher: <strong>{reportData.promotions.usageRate || 0}%</strong></p>
                  <table className="admin-table">
                    <thead><tr><th>Mã voucher</th><th>Lượt dùng</th><th>Doanh thu</th></tr></thead>
                    <tbody>{topVouchers.map((item) => <tr key={`vc-${item.code}`}><td>{item.code}</td><td>{item.usageCount}</td><td>{formatMoney(item.revenue)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      );
    }

    if (activeSection === 'content_pages') {
      return <BlogManager />;
    }

    if (activeSection === 'chat_messages') {
      return <ChatSupportManager />;
    }

    if (activeSection === 'purchase_receipts') {
      const purchaseTotal = purchaseForm.items.reduce((total, item) => total + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
      const supplierOptionsList = Array.isArray(supplierOptions) ? supplierOptions : [];
      const dateBuckets = Array.from(new Set((purchaseReceipts || []).map((receipt) => {
        const date = new Date(receipt.receivedAt || receipt.createdAt || new Date());
        if (Number.isNaN(date.getTime())) {
          return '';
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }).filter(Boolean))).sort((left, right) => right.localeCompare(left));

      return (
        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nhập kho</p>
              <h2>Quản lý phiếu nhập</h2>
            </div>
          </div>

          <div className="admin-card-grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
            <article className="admin-card">
              <h3>Danh sách phiếu nhập</h3>
              <div className="admin-inline-controls" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <input value={purchaseQuery} onChange={(event) => setPurchaseQuery(event.target.value)} placeholder="Tìm kiếm phiếu nhập" />
                <select value={purchaseSupplierFilter} onChange={(event) => setPurchaseSupplierFilter(event.target.value)}>
                  <option value="all">Tất cả nhà cung cấp</option>
                  {supplierOptionsList.map((supplier) => (
                    <option key={supplier.ncc_ma || supplier.id} value={supplier.ncc_ma || supplier.id}>{supplier.ncc_ten || supplier.name}</option>
                  ))}
                </select>
                <select value={purchaseDateFilter} onChange={(event) => setPurchaseDateFilter(event.target.value)}>
                  <option value="all">Tất cả thời gian</option>
                  {dateBuckets.map((bucket) => (
                    <option key={bucket} value={bucket}>{bucket}</option>
                  ))}
                </select>
              </div>

              <div className="admin-table-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã phiếu</th>
                      <th>Ngày nhập</th>
                      <th>Nhà cung cấp</th>
                      <th>Người nhập</th>
                      <th>Tổng tiền</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchaseReceipts.length > 0 ? filteredPurchaseReceipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td>{receipt.code}</td>
                        <td>{new Date(receipt.receivedAt || receipt.createdAt || new Date()).toLocaleDateString('vi-VN')}</td>
                        <td>{receipt.supplierName}</td>
                        <td>{receipt.employeeName}</td>
                        <td>{formatMoney(receipt.total)}</td>
                        <td>
                          <button type="button" className="secondary-button" onClick={() => setSelectedPurchaseId(String(receipt.id))}>Xem</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6">Chưa có phiếu nhập nào.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="admin-card">
              <h3>Tạo phiếu nhập</h3>
              <form onSubmit={handleCreatePurchaseReceipt} className="admin-form">
                <label>
                  Mã phiếu
                  <input value={selectedPurchase ? selectedPurchase.code : 'PN mới'} readOnly />
                </label>
                <label>
                  Ngày nhập
                  <input type="date" value={purchaseForm.date} onChange={(event) => handlePurchaseInputChange('date', event.target.value)} />
                </label>

                {purchaseForm.supplierId && (
                  <label>
                    Nhà cung cấp mặc định
                    <input value={getPurchaseSupplierName(purchaseForm.supplierId) || 'Everjoy Publishing'} readOnly style={{ backgroundColor: '#f5f5f5' }} />
                  </label>
                )}

                <div className="span-2">
                  <h4>Danh sách sản phẩm nhập</h4>
                  <div className="admin-inline-controls" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <input value={purchaseSearchProducts} onChange={(event) => setPurchaseSearchProducts(event.target.value)} placeholder="Tìm sản phẩm..." />
                  </div>
                  <div className="admin-selector-grid" style={{ display: 'grid', gap: '8px', maxHeight: '240px', overflow: 'auto' }}>
                    {purchaseProductOptions.map((product) => (
                      <div key={product.id || product.sp_ma} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', border: '1px solid #eee', borderRadius: '10px', padding: '8px' }}>
                        <div>
                          <strong>{product.name || product.sp_ten}</strong>
                          <div>Tồn kho: {Number(product.stock ?? product.sp_soluong ?? 0)}</div>
                          <div>Giá bán: {formatMoney(product.price ?? product.sp_giaban ?? 0)}</div>
                        </div>
                        <button type="button" className="primary-button" onClick={() => handleAddPurchaseItem(product)}>Thêm</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="span-2">
                  {purchaseForm.items.length > 0 ? (
                    <table className="admin-table">
                      <thead>
                        <tr><th>Sản phẩm</th><th>Giá bán</th><th>Số lượng</th><th>Giá nhập</th><th>Thành tiền</th><th></th></tr>
                      </thead>
                      <tbody>
                        {purchaseForm.items.map((item, index) => {
                          const importPrice = Number(item.unitPrice || 0);
                          const salePrice = Number(item.salePrice || 0);
                          const isPriceInvalid = importPrice >= salePrice;
                          return (
                            <tr key={`${item.productId}-${index}`} style={{ backgroundColor: isPriceInvalid ? '#ffe6e6' : 'transparent' }}>
                              <td>{item.name}</td>
                              <td>{formatMoney(salePrice)}</td>
                              <td><input type="number" min="1" value={item.quantity} onChange={(event) => handlePurchaseItemChange(index, 'quantity', event.target.value)} /></td>
                              <td><input type="number" min="0" value={item.unitPrice} onChange={(event) => handlePurchaseItemChange(index, 'unitPrice', event.target.value)} style={{ borderColor: isPriceInvalid ? '#ff0000' : 'inherit' }} /></td>
                              <td>{formatMoney((Number(item.quantity || 0) * Number(item.unitPrice || 0)))}</td>
                              <td><button type="button" className="danger-button" onClick={() => handleRemovePurchaseItem(index)}>Xóa</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <p>Chưa có sản phẩm nào được thêm.</p>}
                  <div style={{ textAlign: 'right', marginTop: '10px', fontWeight: 700 }}>
                    Tổng: {formatMoney(purchaseTotal)}
                  </div>
                </div>

                <label className="span-2">
                  Ghi chú
                  <textarea rows="3" value={purchaseForm.note} onChange={(event) => handlePurchaseInputChange('note', event.target.value)} />
                </label>

                <div className="span-2 admin-form-actions">
                  <button className="primary-button" type="submit">Xác nhận nhập kho</button>
                </div>
              </form>
            </article>
          </div>

          {selectedPurchase ? (
            <article className="admin-card" style={{ marginTop: '18px' }}>
              <h3>Chi tiết phiếu nhập {selectedPurchase.code}</h3>
              <p><strong>Mã phiếu:</strong> {selectedPurchase.code}</p>
              <p><strong>Ngày nhập:</strong> {new Date(selectedPurchase.receivedAt || selectedPurchase.createdAt || new Date()).toLocaleDateString('vi-VN')}</p>
              <p><strong>Nhà cung cấp:</strong> {selectedPurchase.supplierName}</p>
              <p><strong>Nhân viên:</strong> {selectedPurchase.employeeName}</p>
              <table className="admin-table">
                <thead>
                  <tr><th>Sản phẩm</th><th>Số lượng</th><th>Giá nhập</th><th>Thành tiền</th></tr>
                </thead>
                <tbody>
                  {selectedPurchase.items.map((item) => (
                    <tr key={`${selectedPurchase.id}-${item.productId}`}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.unitPrice)}</td>
                      <td>{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: '10px', fontWeight: 700 }}>
                Tổng tiền: {formatMoney(selectedPurchase.total)}
              </div>
            </article>
          ) : null}
        </section>
      );
    }

    const config = collectionConfigs[activeSection];
    if (!config) {
      return null;
    }

    const currentItems = collections[activeSection] || [];

    return (
      <section className="admin-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{config.title}</p>
            <h2>{editingCollection?.collectionName === activeSection ? `Chỉnh sửa ${config.title.toLowerCase()}` : `Tạo mới ${config.title.toLowerCase()}`}</h2>
          </div>
        </div>

        <form className="admin-form" onSubmit={(event) => handleCollectionSubmit(activeSection, event)}>
          {config.fields.map((field) => (
            <label key={field.name} className={field.type === 'textarea' ? 'span-2' : ''}>
              {field.label}
              {field.type === 'textarea' ? (
                <textarea
                  rows="4"
                  value={genericForms[activeSection]?.[field.name] || ''}
                  onChange={(event) => handleCollectionFieldChange(activeSection, field.name, event.target.value)}
                  placeholder={field.placeholder || field.label}
                />
              ) : (
                <input
                  type={field.type || 'text'}
                  value={genericForms[activeSection]?.[field.name] || ''}
                  onChange={(event) => handleCollectionFieldChange(activeSection, field.name, event.target.value)}
                  placeholder={field.placeholder || field.label}
                />
              )}
            </label>
          ))}

          <div className="span-2 admin-form-actions">
            <button className="primary-button" type="submit">{editingCollection?.collectionName === activeSection ? 'Cập nhật' : 'Thêm mới'}</button>
            {editingCollection?.collectionName === activeSection ? <button className="secondary-button" type="button" onClick={() => setEditingCollection(null)}>Hủy chỉnh sửa</button> : null}
          </div>
        </form>

        <div className="admin-table-card">
          <h3>Danh sách {config.title.toLowerCase()}</h3>
          <div className="admin-list-grid">
            {currentItems.map((item) => (
              <article key={item._id || item.id} className="admin-list-item">
                <strong>{item.title || item.name || item.productName || item.customerName || item.type || item.email || item._id}</strong>
                <p>{item.content || item.message || item.status || item.discount || item.author || item.name || item.type || '-'}</p>
                <div className="admin-row-actions">
                  <button type="button" className="secondary-button" onClick={() => populateCollectionForm(activeSection, item)}>Sửa</button>
                  <button type="button" className="danger-button" onClick={() => handleDeleteCollectionItem(activeSection, item._id || item.id)}>Xóa</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img className="admin-logo" src="/logo.jpg" alt="Board Game VN" />
        </div>

        <nav className="admin-nav" aria-label="Thanh điều hướng quản trị">
          {availableSections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`admin-nav-item ${activeSection === section.key ? 'active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="secondary-button full-width" type="button" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Quản trị</p>
            <h2>Điều phối toàn bộ dữ liệu cửa hàng</h2>
          </div>

          <div className="admin-topbar-actions">
            <span className="admin-topbar-employee">{authUser?.displayName || authUser?.fullName || authUser?.username || 'Nhân viên'}</span>

            <div className="admin-topbar-dropdown">
              <button
                type="button"
                className="admin-icon-button"
                onClick={() => { setIsNotificationsOpen((current) => !current); setIsProfileMenuOpen(false); }}
                aria-label="Thông báo"
              >
                🔔
                {dashboardNotifications.length > 0 ? <span className="admin-badge">{dashboardNotifications.length}</span> : null}
              </button>
              {isNotificationsOpen ? (
                <div className="admin-dropdown-panel">
                  <h4>Thông báo</h4>
                  {dashboardNotifications.length > 0 ? (
                    <ul>
                      {dashboardNotifications.map((notification) => <li key={notification}>{notification}</li>)}
                    </ul>
                  ) : <p>Không có thông báo mới.</p>}
                </div>
              ) : null}
            </div>

            <div className="admin-topbar-dropdown">
              <button
                type="button"
                className="admin-icon-button admin-profile-button"
                onClick={() => { setIsProfileMenuOpen((current) => !current); setIsNotificationsOpen(false); }}
                aria-label="Hồ sơ cá nhân"
              >
                {String(authUser?.displayName || authUser?.fullName || authUser?.username || 'N').slice(0, 1).toUpperCase()}
              </button>
              {isProfileMenuOpen ? (
                <div className="admin-dropdown-panel">
                  <h4>Hồ sơ cá nhân</h4>
                  <p>{authUser?.displayName || authUser?.fullName || authUser?.username}</p>
                  <p>{authUser?.email}</p>
                  <button className="secondary-button full-width" type="button" onClick={handleLogout}>Đăng xuất</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {statusMessage ? <p className="admin-message success">{statusMessage}</p> : null}
        {errorMessage ? <p className="admin-message error">{errorMessage}</p> : null}

        {renderSectionContent()}
      </main>
    </div>
  );
}

export default Admin;