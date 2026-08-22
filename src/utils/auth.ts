import { AuthUser } from '../types';

const TOKEN_KEY = 'ftth_billing_auth_token';
const USER_KEY = 'ftth_billing_auth_user';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to persist auth session in storage:', err);
  }
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.error('Failed to clear auth session:', err);
  }
}

export function getUserPermission(user?: AuthUser | null): 'ADMIN' | 'RW' | 'R' {
  if (!user) return 'R';
  if (user.permission === 'ADMIN' || user.permission === 'RW' || user.permission === 'R') {
    return user.permission;
  }
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'r' || user.role === 'viewer') return 'R';
  return 'RW';
}

export function canWrite(user?: AuthUser | null): boolean {
  const perm = getUserPermission(user);
  return perm === 'ADMIN' || perm === 'RW';
}

export function isAdmin(user?: AuthUser | null): boolean {
  const perm = getUserPermission(user);
  return perm === 'ADMIN';
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // If token is invalid or expired (401), clear local session
  if (response.status === 401 && !input.toString().includes('/api/auth/login')) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  return response;
}
