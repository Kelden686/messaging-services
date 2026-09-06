import { useAuthStore } from '../store/useAuthStore';

const BASE_URL = 'http://127.0.0.1:5000/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<any> | null = null;

export const apiClient = async (endpoint: string, options: RequestOptions = {}) => {
  const { params, headers, ...restOptions } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    defaultHeaders['x-refresh-token'] = refreshToken;
  }

  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const config: RequestInit = {
    credentials: 'include', // essential for cookie forwarding
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    ...restOptions,
  };

  let response = await fetch(url, config);

  // Auto-refresh token if 401 unauthorized and we are not doing auth requests
  if (response.status === 401 && !endpoint.includes('/auth/')) {
    try {
      const activeRefreshToken = localStorage.getItem('refreshToken');
      if (!activeRefreshToken) {
        throw new Error('No refresh token available');
      }

      // If there is no active refresh token request in-flight, start one
      if (!refreshPromise) {
        refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: activeRefreshToken }),
        }).then(async (res) => {
          if (!res.ok) {
            throw new Error('Refresh token invalid');
          }
          return res.json();
        }).finally(() => {
          // Clear the promise when resolved/rejected
          refreshPromise = null;
        });
      }

      // Await the shared refresh request
      const data = await refreshPromise;
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }

      // Sync headers with the new tokens for the retried request
      const newRefreshToken = localStorage.getItem('refreshToken');
      const newAccessToken = localStorage.getItem('accessToken');
      if (config.headers) {
        if (newRefreshToken) {
          (config.headers as Record<string, string>)['x-refresh-token'] = newRefreshToken;
        }
        if (newAccessToken) {
          (config.headers as Record<string, string>)['Authorization'] = `Bearer ${newAccessToken}`;
        }
      }

      // Retry original request with new session cookie in browser
      response = await fetch(url, config);
    } catch (err) {
      // Refresh token failed/expired
      useAuthStore.getState().logoutAction();
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(errorData.error || 'Something went wrong', response.status);
  }

  return response.json();
};
