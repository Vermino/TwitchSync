// Filepath: frontend/src/lib/api/baseClient.ts

import axios, { AxiosInstance } from 'axios';

export class BaseApiClient {
  protected axios: AxiosInstance;
  protected baseURL = '/api';
  protected authURL = '/auth';

  constructor() {
    this.axios = axios.create();
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth token
    this.axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  protected getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  protected handleError(error: any): Error {
    console.error('API Error:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.data?.details) {
        const details = error.response.data.details;
        const messages = details.map((detail: any) => detail.message);
        return new Error(messages.join(', '));
      }
      return new Error(error.response?.data?.message || error.message);
    }

    return error instanceof Error ? error : new Error('An unknown error occurred');
  }
}
