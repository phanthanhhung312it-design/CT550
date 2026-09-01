import { useEffect, useState } from 'react';
import { getAuthToken, getAuthUser } from './auth';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
const LEGACY_CART_STORAGE_KEY = 'boardgamevn-cart';
const CART_STORAGE_PREFIX = 'boardgamevn-cart';
const CART_EVENT = 'boardgamevn-cart-change';
const DEBUG_CART = true;
const CART_DISABLED_ROLES = new Set(['admin', 'manager', 'employee', 'staff', 'nhanvien', 'nhân viên', 'quanly', 'quan ly', 'superadmin']);

function debugLog(...args) {
  if (DEBUG_CART && typeof console !== 'undefined') {
    console.debug('[cartStorage]', ...args);
  }
}

function normalizeCartItems(items) {
  const cartMap = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!productId || !quantity || quantity <= 0) {
      return;
    }

    cartMap.set(productId, (cartMap.get(productId) || 0) + quantity);
  });

  return [...cartMap.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

function getNormalizedRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isCartEnabledUser(user) {
  const role = getNormalizedRole(user?.role);
  return !CART_DISABLED_ROLES.has(role);
}

function getCartStorageKey() {
  const authUser = getAuthUser();
  const user = authUser?.user;

  if (!user) {
    return `${CART_STORAGE_PREFIX}:guest`;
  }

  if (!isCartEnabledUser(user)) {
    return null;
  }

  const userId = user?.id ?? user?.userId ?? user?.username ?? user?.email;
  const scope = userId === undefined || userId === null || userId === '' ? 'guest' : String(userId);
  return `${CART_STORAGE_PREFIX}:${scope}`;
}

function readCartItems() {
  try {
    const storageKey = getCartStorageKey();
    if (!storageKey) {
      return [];
    }

    const preferredValue = window.localStorage.getItem(storageKey);
    const fallbackValue = storageKey === `${CART_STORAGE_PREFIX}:guest`
      ? window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)
      : null;
    const rawValue = preferredValue ?? fallbackValue;
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    const normalized = normalizeCartItems(parsed);
    debugLog('readCartItems', { storageKey, rawValue, parsed, normalized });
    return normalized;
  } catch {
    return [];
  }
}

function writeCartItems(items) {
  const storageKey = getCartStorageKey();
  if (!storageKey) {
    return;
  }

  const normalized = normalizeCartItems(items);
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  debugLog('writeCartItems', { storageKey, normalized });
  window.dispatchEvent(new Event(CART_EVENT));
}

async function request(path, options = {}) {
  const authToken = getAuthToken();
  if (!authToken) {
    return null;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || 'Không thể đồng bộ giỏ hàng.');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}

function normalizeRemoteCartRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return normalizeCartItems(rows.map((item) => ({
    productId: Number(item?.productId),
    quantity: Number(item?.quantity || 1),
  })));
}

let cartHydrationPromise = null;

async function mergeLocalCartIntoServer(localItems) {
  try {
    const remoteRows = await request('/account/cart').catch(() => null);
    const remoteMap = new Map((Array.isArray(remoteRows) ? remoteRows : []).map((r) => [Number(r.productId), Number(r.quantity || 0)]));

    await Promise.all(localItems.map(async (item) => {
      const pid = Number(item.productId);
      const localQty = Number(item.quantity || 0);
      if (!pid || !localQty) return null;

      const remoteQty = remoteMap.get(pid) || 0;
      // Prefer the larger quantity to avoid double-counting when both sides contain the same adds
      const targetQty = Math.max(remoteQty, localQty);

      if (remoteQty > 0) {
        debugLog('mergeLocalCartIntoServer - PUT (use max)', { productId: pid, remoteQty, localQty, targetQty });
        return request(`/account/cart/items/${encodeURIComponent(pid)}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity: targetQty }),
        }).catch(() => null);
      }

      debugLog('mergeLocalCartIntoServer - POST', { productId: pid, localQty });
      return request('/account/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: pid, quantity: localQty }),
      }).catch(() => null);
    }));
  } catch (e) {
    debugLog('mergeLocalCartIntoServer - error', e && e.message ? e.message : e);
  }
}

export function getCartItems() {
  return readCartItems();
}

export function getCartItemCount() {
  return readCartItems().reduce((total, item) => total + Number(item.quantity || 0), 0);
}

export async function hydrateCartFromServer() {
  const authUser = getAuthUser()?.user;
  if (!getAuthToken() || !authUser || !isCartEnabledUser(authUser)) {
    return readCartItems();
  }

  if (!cartHydrationPromise) {
    cartHydrationPromise = (async () => {
      const localItems = readCartItems();
      const remoteRows = await request('/account/cart').catch(() => null);

      if (Array.isArray(remoteRows) && localItems.length > 0) {
        await mergeLocalCartIntoServer(localItems);
      }

      const refreshedRows = await request('/account/cart').catch(() => remoteRows);
      const normalized = normalizeRemoteCartRows(refreshedRows);
      writeCartItems(normalized);
      return normalized;
    })().finally(() => {
      cartHydrationPromise = null;
    });
  }

  return cartHydrationPromise;
}

export function addToCart(productId, quantity = 1) {
  const authUser = getAuthUser()?.user;
  if (authUser && !isCartEnabledUser(authUser)) {
    return;
  }

  const normalizedProductId = Number(productId);
  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const items = readCartItems();
  debugLog('addToCart called', { productId: normalizedProductId, quantity: normalizedQuantity, before: items });
  const existingItem = items.find((item) => item.productId === normalizedProductId);

  if (existingItem) {
    existingItem.quantity += normalizedQuantity;
  } else {
    items.push({ productId: normalizedProductId, quantity: normalizedQuantity });
  }

  writeCartItems(items);
  window.dispatchEvent(new CustomEvent('boardgamevn-cart-feedback', { detail: { productId: normalizedProductId, quantity: normalizedQuantity } }));

  debugLog('addToCart after write', readCartItems());

  if (getAuthToken()) {
    request('/account/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: normalizedProductId, quantity: normalizedQuantity }),
    }).then(() => hydrateCartFromServer()).catch(() => hydrateCartFromServer().catch(() => items));
  }
}

export function updateCartItemQuantity(productId, quantity) {
  const authUser = getAuthUser()?.user;
  if (authUser && !isCartEnabledUser(authUser)) {
    return;
  }

  const normalizedProductId = Number(productId);
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) {
    debugLog('updateCartItemQuantity - invalid quantity', { productId: normalizedProductId, quantity });
    return;
  }

  const normalizedQuantity = Math.round(parsed);
  const items = readCartItems()
    .map((item) => (item.productId === normalizedProductId ? { ...item, quantity: normalizedQuantity } : item))
    .filter((item) => item.quantity > 0);

  debugLog('updateCartItemQuantity called', { productId: normalizedProductId, quantity: normalizedQuantity, after: items });

  writeCartItems(items);

  if (getAuthToken()) {
    request(`/account/cart/items/${encodeURIComponent(normalizedProductId)}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity: normalizedQuantity }),
    }).then(() => hydrateCartFromServer()).catch(() => hydrateCartFromServer().catch(() => items));
  }
}

export function removeCartItem(productId) {
  const authUser = getAuthUser()?.user;
  if (authUser && !isCartEnabledUser(authUser)) {
    return;
  }

  const normalizedProductId = Number(productId);
  const items = readCartItems().filter((item) => item.productId !== normalizedProductId);
  writeCartItems(items);

  if (getAuthToken()) {
    request(`/account/cart/items/${encodeURIComponent(normalizedProductId)}`, {
      method: 'DELETE',
    }).catch(() => hydrateCartFromServer().catch(() => items));
  }
}

export function clearCart() {
  const authUser = getAuthUser()?.user;
  if (authUser && !isCartEnabledUser(authUser)) {
    return;
  }

  writeCartItems([]);

  if (getAuthToken()) {
    request('/account/cart', {
      method: 'DELETE',
    }).catch(() => hydrateCartFromServer().catch(() => []));
  }
}

export function useCartItemsState() {
  const [cartItems, setCartItems] = useState(getCartItems());

  useEffect(() => {
    function syncCart() {
      setCartItems(getCartItems());
    }

    function handleAuthChange() {
      hydrateCartFromServer().then(syncCart).catch(syncCart);
    }

    syncCart();
    hydrateCartFromServer().then(syncCart).catch(() => undefined);

    window.addEventListener(CART_EVENT, syncCart);
    window.addEventListener('storage', syncCart);
    window.addEventListener('boardgamevn-auth-change', handleAuthChange);

    return () => {
      window.removeEventListener(CART_EVENT, syncCart);
      window.removeEventListener('storage', syncCart);
      window.removeEventListener('boardgamevn-auth-change', handleAuthChange);
    };
  }, []);

  return cartItems;
}
