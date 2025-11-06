import axios from 'axios';
import { TokenManager } from '../utils/tokenManager.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Create axios instance
const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// FIXED: Request interceptor that properly handles tokens
API.interceptors.request.use(
  (config) => {
    // Get token using consistent method
    const token = TokenManager.getToken();
    
    if (token && typeof token === 'string' && token.trim()) {
      config.headers.Authorization = `Bearer ${token.trim()}`;
      console.log('🔑 Added auth header to request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        hasToken: true,
        tokenLength: token.length
      });
    } else {
      console.log('⚠️ No valid token found for request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        hasToken: false
      });
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// FIXED: Response interceptor with better error handling
API.interceptors.response.use(
  (response) => {
    console.log('✅ API Success:', {
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status
    });
    return response;
  },
  (error) => {
    console.error('❌ API Error:', {
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });

    // Handle 401 errors consistently
    if (error.response?.status === 401) {
      console.log('🚪 401 error - token likely invalid');
      
      // Clear invalid tokens
      TokenManager.clearAuth();
      
      // Don't auto-redirect, let components handle it
      const authError = new Error('Authentication failed');
      authError.isAuthError = true;
      authError.response = error.response;
      return Promise.reject(authError);
    }

    return Promise.reject(error);
  }
);

export default API;