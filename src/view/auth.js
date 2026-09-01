const AUTH_STORAGE_KEY = 'boardgamevn-auth-user';

export function getAuthUser() {
  try {
    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

export function setAuthUser(authState) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
  window.dispatchEvent(new Event('boardgamevn-auth-change'));
}

export function clearAuthUser() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event('boardgamevn-auth-change'));
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function getAuthToken() {
  return getAuthUser()?.token || '';
}