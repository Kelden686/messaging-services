import { create } from 'zustand';
import { RegisterInput, LoginInput, VerifyOtpInput } from 'shared';
import { apiClient } from '../utils/apiClient';

interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  status: string | null;
  phone: string | null;
  publicKey: string | null;
  isOnline: boolean;
  lastSeenAt: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  error: string | null;

  register: (input: RegisterInput) => Promise<{ email: string; message: string }>;
  verifyOtp: (input: VerifyOtpInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAction: () => void;
  checkAuth: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isCheckingAuth: true,
  error: null,

  register: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      set({ isLoading: false });
      return data;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  verifyOtp: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  login: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await apiClient('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      get().logoutAction();
    }
  },

  logoutAction: () => {
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('accessToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  checkAuth: async () => {
    set({ isCheckingAuth: true, error: null });
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      set({ user: null, isAuthenticated: false, isCheckingAuth: false });
      return;
    }
    try {
      const user = await apiClient('/users/me');
      set({ user, isAuthenticated: true, isCheckingAuth: false });
    } catch (err) {
      // API client will auto-logout if token refresh fails, which updates state
      set({ user: null, isAuthenticated: false, isCheckingAuth: false });
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await apiClient('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      set({ user: res.user });
    } catch (err: any) {
      throw err;
    }
  },
}));
