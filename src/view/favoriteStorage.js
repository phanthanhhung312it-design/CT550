import { useEffect, useState } from 'react';
import { getAuthToken } from './auth';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
const FAVORITE_STORAGE_KEY = 'boardgamevn-favorites';
const FAVORITE_EVENT = 'boardgamevn-favorite-change';

function readFavoriteItems() {
  try {
    const rawValue = window.localStorage.getItem(FAVORITE_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue)
      ? [...new Set(parsedValue.map((item) => Number(item)).filter((item) => item > 0))]
      : [];
  } catch {
    return [];
  }
}

function writeFavoriteItems(items) {
  const normalized = [...new Set((Array.isArray(items) ? items : []).map((item) => Number(item)).filter((item) => item > 0))];
  window.localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(FAVORITE_EVENT));
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
    throw new Error(payload?.message || 'Không thể đồng bộ danh sách yêu thích.');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}

function normalizeFavoriteRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return [...new Set(rows.map((item) => Number(item?.productId)).filter((item) => item > 0))];
}

let favoriteHydrationPromise = null;

async function mergeLocalFavoritesToServer(localFavorites) {
  await Promise.all(localFavorites.map((productId) => (
    request('/account/favorites', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    }).catch(() => null)
  )));
}

export function getFavoriteItems() {
  return readFavoriteItems();
}

export async function hydrateFavoritesFromServer() {
  if (!getAuthToken()) {
    return readFavoriteItems();
  }

  if (!favoriteHydrationPromise) {
    favoriteHydrationPromise = (async () => {
      const localFavorites = readFavoriteItems();
      const remoteRows = await request('/account/favorites').catch(() => null);

      if (Array.isArray(remoteRows) && localFavorites.length > 0) {
        await mergeLocalFavoritesToServer(localFavorites);
      }

      const refreshedRows = await request('/account/favorites').catch(() => remoteRows);
      const normalized = normalizeFavoriteRows(refreshedRows);
      writeFavoriteItems(normalized);
      return normalized;
    })().finally(() => {
      favoriteHydrationPromise = null;
    });
  }

  return favoriteHydrationPromise;
}

export async function addFavorite(productId) {
  const normalizedProductId = Number(productId);
  if (!normalizedProductId) {
    return readFavoriteItems();
  }

  const nextItems = [...new Set([...readFavoriteItems(), normalizedProductId])];
  writeFavoriteItems(nextItems);

  if (getAuthToken()) {
    try {
      await request('/account/favorites', {
        method: 'POST',
        body: JSON.stringify({ productId: normalizedProductId }),
      });
      await hydrateFavoritesFromServer();
    } catch {
      await hydrateFavoritesFromServer().catch(() => nextItems);
    }
  }

  return nextItems;
}

export async function removeFavorite(productId) {
  const normalizedProductId = Number(productId);
  const nextItems = readFavoriteItems().filter((item) => item !== normalizedProductId);
  writeFavoriteItems(nextItems);

  if (getAuthToken()) {
    try {
      await request(`/account/favorites/${encodeURIComponent(normalizedProductId)}`, {
        method: 'DELETE',
      });
    } catch {
      await hydrateFavoritesFromServer().catch(() => nextItems);
    }
  }

  return nextItems;
}

export async function toggleFavorite(productId) {
  const normalizedProductId = Number(productId);
  if (readFavoriteItems().includes(normalizedProductId)) {
    await removeFavorite(normalizedProductId);
    return false;
  }

  await addFavorite(normalizedProductId);
  return true;
}

export function useFavoriteItemsState() {
  const [favoriteItems, setFavoriteItems] = useState(getFavoriteItems());

  useEffect(() => {
    function syncFavorites() {
      setFavoriteItems(getFavoriteItems());
    }

    function handleAuthChange() {
      hydrateFavoritesFromServer().then(syncFavorites).catch(syncFavorites);
    }

    syncFavorites();
    hydrateFavoritesFromServer().then(syncFavorites).catch(() => undefined);

    window.addEventListener(FAVORITE_EVENT, syncFavorites);
    window.addEventListener('storage', syncFavorites);
    window.addEventListener('boardgamevn-auth-change', handleAuthChange);

    return () => {
      window.removeEventListener(FAVORITE_EVENT, syncFavorites);
      window.removeEventListener('storage', syncFavorites);
      window.removeEventListener('boardgamevn-auth-change', handleAuthChange);
    };
  }, []);

  return favoriteItems;
}