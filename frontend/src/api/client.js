import axios from 'axios';

const TOKEN_KEY = 'studymate.token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

/**
 * All requests go to /api on the same origin; Vite proxies them to the backend.
 * The browser never sees AI provider keys — the frontend only knows StudyMate's API.
 */
export const api = axios.create({ baseURL: '/api', timeout: 90000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Timezone-Offset'] = String(new Date().getTimezoneOffset());
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('studymate:logout'));
    }
    return Promise.reject(error);
  }
);

/** Human-readable message from an axios error. */
export function errorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (error?.response?.status === 502 || error?.response?.status === 504 || error?.code === 'ERR_NETWORK' || error?.message === 'Network Error')
    return 'Cannot reach the StudyMate server. Is the backend running on port 5000?';
  return fallback;
}

export const fieldErrors = (error) => error?.response?.data?.error?.details || {};
export const errorCode = (error) => error?.response?.data?.error?.code;
