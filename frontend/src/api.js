const configuredApi = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultApi = import.meta.env.DEV
  ? 'http://localhost:8080/api'
  : 'https://fertilizer-billing-starter.onrender.com/api';

export const API_BASE_URL = (configuredApi || defaultApi).replace(/\/+$/, '');
