import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3501',
        changeOrigin: true,
      },
      '/auth/twitch': {
        target: 'http://localhost:3501',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://localhost:3501',
        changeOrigin: true,
      },
      '/auth/logout': {
        target: 'http://localhost:3501',
        changeOrigin: true,
      }
    }
  }
});
