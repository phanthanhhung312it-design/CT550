import { useEffect, useState } from 'react';
import {
  blogPosts as fallbackBlogPosts,
  orders as fallbackOrders,
  products as fallbackProducts,
  rentalProducts as fallbackRentalProducts,
} from './boardgameData';

const apiBase = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
const EMPTY_ITEMS = [];

function dispatchCollectionRefresh(path) {
  window.dispatchEvent(new Event(`boardgamevn-refresh:${path}`));
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json();
}

function useRemoteCollection(path, fallbackItems, options = {}) {
  const { refreshMs = 0, useFallbackOnError = true } = options;
  const [items, setItems] = useState(fallbackItems);

  useEffect(() => {
    if (!path) {
      setItems(Array.isArray(fallbackItems) ? fallbackItems : []);
      return undefined;
    }

    let active = true;

    async function loadItems() {
      try {
        const nextItems = await fetchJson(path);
        if (active && Array.isArray(nextItems)) {
          setItems(nextItems);
        }
      } catch {
        if (active) {
          if (useFallbackOnError) {
            setItems(fallbackItems);
          }
        }
      }
    }

    loadItems();

    const refreshEventName = `boardgamevn-refresh:${path}`;
    window.addEventListener(refreshEventName, loadItems);

    let intervalId = null;
    if (refreshMs > 0) {
      intervalId = window.setInterval(loadItems, refreshMs);
    }

    return () => {
      active = false;
      window.removeEventListener(refreshEventName, loadItems);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [fallbackItems, path, refreshMs, useFallbackOnError]);

  return items;
}

export function useProductsData() {
  return useRemoteCollection('/products', fallbackProducts, { refreshMs: 5000 });
}

export function useBestSellerProducts() {
  const products = useRemoteCollection('/products/best-sellers', EMPTY_ITEMS, {
    refreshMs: 15000,
    useFallbackOnError: false,
  });

  return [...products]
    .sort((left, right) => (
      (Number(right.soldQuantity || 0) - Number(left.soldQuantity || 0))
      || (Number(right.averageRating || 0) - Number(left.averageRating || 0))
      || (Number(right.reviewCount || 0) - Number(left.reviewCount || 0))
      || (Number(left.id || 0) - Number(right.id || 0))
    ))
    .map((product, index) => ({
      ...product,
      rank: product.rank || index + 1,
    }));
}

export function useBlogPosts() {
  return useRemoteCollection('/blog-posts', fallbackBlogPosts);
}

export function useBlogCategories() {
  return useRemoteCollection('/blog-posts/categories', []);
}

export function useOrdersData(userId) {
  const path = userId ? `/orders?userId=${encodeURIComponent(userId)}` : '/orders';
  const fallbackItems = userId ? EMPTY_ITEMS : fallbackOrders;
  return useRemoteCollection(path, fallbackItems, { refreshMs: 5000, useFallbackOnError: false });
}

export function useRentalProductsData() {
  return useRemoteCollection('/rentals/products', fallbackRentalProducts);
}

export function useRentalOrdersData(userId) {
  const path = userId ? `/rentals?userId=${encodeURIComponent(userId)}` : null;
  return useRemoteCollection(path, EMPTY_ITEMS, { refreshMs: 5000, useFallbackOnError: false });
}

export function useReviewsData(userId) {
  const path = userId ? `/reviews?userId=${encodeURIComponent(userId)}` : null;
  return useRemoteCollection(path, EMPTY_ITEMS, { refreshMs: 5000, useFallbackOnError: false });
}

export function useRentalOptionsData(userId) {
  const [options, setOptions] = useState({
    addresses: [],
    paymentMethods: [],
    shippingUnits: [],
    vouchers: [],
  });

  useEffect(() => {
    let active = true;
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';

    async function loadOptions() {
      try {
        const payload = await fetchJson(`/rentals/options${query}`);
        if (!active) {
          return;
        }

        setOptions({
          addresses: Array.isArray(payload?.addresses) ? payload.addresses : [],
          paymentMethods: Array.isArray(payload?.paymentMethods) ? payload.paymentMethods : [],
          shippingUnits: Array.isArray(payload?.shippingUnits) ? payload.shippingUnits : [],
          vouchers: Array.isArray(payload?.vouchers) ? payload.vouchers : [],
        });
      } catch {
        if (active) {
          setOptions({
            addresses: [],
            paymentMethods: [],
            shippingUnits: [],
            vouchers: [],
          });
        }
      }
    }

    loadOptions();

    const intervalId = window.setInterval(loadOptions, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  return options;
}

export function useVoucherCatalog(userId) {
  const [catalog, setCatalog] = useState({ publicVouchers: [], privateVouchers: [], all: [] });

  useEffect(() => {
    let active = true;
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';

    async function loadCatalog() {
      try {
        const payload = await fetchJson(`/vouchers${query}`);
        if (!active) {
          return;
        }

        setCatalog({
          publicVouchers: Array.isArray(payload?.publicVouchers) ? payload.publicVouchers : [],
          privateVouchers: Array.isArray(payload?.privateVouchers) ? payload.privateVouchers : [],
          all: Array.isArray(payload?.all) ? payload.all : [],
        });
      } catch {
        const optionsPayload = await fetchJson(`/rentals/options${query}`).catch(() => null);
        if (!active) {
          return;
        }

        const vouchers = Array.isArray(optionsPayload?.vouchers) ? optionsPayload.vouchers : [];
        const normalized = vouchers.map((voucher) => ({
          ...voucher,
          scope: String(voucher.scope || 'public').toLowerCase().includes('private') ? 'private' : 'public',
        }));

        setCatalog({
          publicVouchers: normalized.filter((voucher) => voucher.scope !== 'private'),
          privateVouchers: normalized.filter((voucher) => voucher.scope === 'private'),
          all: normalized,
        });
      }
    }

    loadCatalog();

    const intervalId = window.setInterval(loadCatalog, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  return catalog;
}

export async function validateVoucher(payload) {
  const response = await fetch(`${apiBase}/vouchers/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể kiểm tra voucher.');
  }

  return result;
}

export async function getAdminVouchers(params = {}, authToken = '') {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.status) {
    searchParams.set('status', params.status);
  }
  if (params.type) {
    searchParams.set('type', params.type);
  }

  const response = await fetch(`${apiBase}/vouchers/admin${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải danh sách voucher.');
  }

  return Array.isArray(result) ? result : [];
}

export async function createAdminVoucher(payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/vouchers/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tạo voucher.');
  }

  return result;
}

export async function updateAdminVoucher(voucherId, payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/vouchers/admin/${encodeURIComponent(voucherId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật voucher.');
  }

  return result;
}

export async function updateAdminVoucherStatus(voucherId, status, authToken = '') {
  const response = await fetch(`${apiBase}/vouchers/admin/${encodeURIComponent(voucherId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ status }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật trạng thái voucher.');
  }

  return result;
}

export async function deleteAdminVoucher(voucherId, authToken = '') {
  const response = await fetch(`${apiBase}/vouchers/admin/${encodeURIComponent(voucherId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'Không thể xóa voucher.');
  }
}

export async function assignAdminVoucherCustomers(voucherId, payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/vouchers/admin/${encodeURIComponent(voucherId)}/assignments`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cấp voucher cho khách hàng.');
  }

  return Array.isArray(result) ? result : [];
}

export async function getVoucherCustomers(search = '', authToken = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await fetch(`${apiBase}/vouchers/admin/customers${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải danh sách khách hàng.');
  }

  return Array.isArray(result) ? result : [];
}

export async function getAccountProfile(authToken = '') {
  const response = await fetch(`${apiBase}/account/profile`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải thông tin tài khoản.');
  }

  return result;
}

export async function updateAccountProfile(payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/account/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật thông tin tài khoản.');
  }

  return result;
}

export async function updateAccountPassword(payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/account/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật mật khẩu.');
  }

  return result;
}

export async function getAccountAddresses(authToken = '') {
  const response = await fetch(`${apiBase}/account/addresses`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải địa chỉ giao hàng.');
  }

  return Array.isArray(result) ? result : [];
}

export async function createAccountAddress(payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/account/addresses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể thêm địa chỉ mới.');
  }

  return result;
}

export async function updateAccountAddress(addressId, payload = {}, authToken = '') {
  const response = await fetch(`${apiBase}/account/addresses/${encodeURIComponent(addressId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật địa chỉ giao hàng.');
  }

  return result;
}

export async function setAccountDefaultAddress(addressId, authToken = '') {
  const response = await fetch(`${apiBase}/account/addresses/${encodeURIComponent(addressId)}/default`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể đặt địa chỉ mặc định.');
  }

  return result;
}

export async function deleteAccountAddress(addressId, authToken = '') {
  const response = await fetch(`${apiBase}/account/addresses/${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'Không thể xóa địa chỉ giao hàng.');
  }
}

export async function createRentalOrder(payload) {
  const response = await fetch(`${apiBase}/rentals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tạo đơn thuê.');
  }

  return result;
}

export async function createReview(payload) {
  const response = await fetch(`${apiBase}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.message || 'Không thể gửi đánh giá.');
  }

  dispatchCollectionRefresh('/products');
  dispatchCollectionRefresh('/products/best-sellers');

  return result;
}

export async function updateReviewStatus(reviewId, status) {
  const response = await fetch(`${apiBase}/reviews/${reviewId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật trạng thái đánh giá.');
  }

  dispatchCollectionRefresh('/products');
  dispatchCollectionRefresh('/products/best-sellers');

  return result;
}

export async function deleteReview(reviewId) {
  const response = await fetch(`${apiBase}/reviews/${reviewId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'Không thể xóa đánh giá.');
  }

  dispatchCollectionRefresh('/products');
  dispatchCollectionRefresh('/products/best-sellers');
}

export async function getBlogPostDetail(slug) {
  const response = await fetch(`${apiBase}/blog-posts/${encodeURIComponent(slug)}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải chi tiết bài viết.');
  }

  return result;
}

export async function getBlogComments(slug) {
  const response = await fetch(`${apiBase}/blog-posts/${encodeURIComponent(slug)}/comments`);
  const result = await response.json().catch(() => ([]));

  if (!response.ok) {
    throw new Error('Không thể tải bình luận bài viết.');
  }

  return Array.isArray(result) ? result : [];
}

export async function createBlogComment(slug, payload, authToken = '') {
  const response = await fetch(`${apiBase}/blog-posts/${encodeURIComponent(slug)}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể gửi bình luận.');
  }

  return result;
}

export async function getAdminBlogPosts(authToken, params = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.category) {
    searchParams.set('category', params.category);
  }
  if (params.status) {
    searchParams.set('status', params.status);
  }

  const query = searchParams.toString();
  const response = await fetch(`${apiBase}/blog-posts/admin/posts${query ? `?${query}` : ''}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải danh sách bài viết quản trị.');
  }

  return Array.isArray(result) ? result : [];
}

export async function createAdminBlogPost(authToken, payload) {
  const response = await fetch(`${apiBase}/blog-posts/admin/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tạo bài viết mới.');
  }

  return result;
}

export async function updateAdminBlogPost(authToken, postId, payload) {
  const response = await fetch(`${apiBase}/blog-posts/admin/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật bài viết.');
  }

  return result;
}

export async function updateAdminBlogPostStatus(authToken, postId, status, isVisible) {
  const response = await fetch(`${apiBase}/blog-posts/admin/posts/${encodeURIComponent(postId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ status, isVisible }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật trạng thái hiển thị bài viết.');
  }

  return result;
}

export async function deleteAdminBlogPost(authToken, postId) {
  const response = await fetch(`${apiBase}/blog-posts/admin/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok && response.status !== 204) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'Không thể xóa bài viết.');
  }
}

export async function getAdminBlogComments(authToken, postId = '') {
  const query = postId ? `?postId=${encodeURIComponent(postId)}` : '';
  const response = await fetch(`${apiBase}/blog-posts/comments${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  const result = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể tải bình luận quản trị.');
  }

  return Array.isArray(result) ? result : [];
}

export async function updateAdminBlogCommentStatus(authToken, commentId, status) {
  const response = await fetch(`${apiBase}/blog-posts/comments/${encodeURIComponent(commentId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ status }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Không thể cập nhật trạng thái bình luận.');
  }

  return result;
}

export async function deleteAdminBlogComment(authToken, commentId) {
  const response = await fetch(`${apiBase}/blog-posts/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok && response.status !== 204) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'Không thể xóa bình luận.');
  }
}

export function useProductFromCollection(id) {
  const products = useProductsData();

  return products.find((product) => String(product.id) === String(id)) || null;
}
