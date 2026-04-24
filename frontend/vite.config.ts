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
    port: 5173,
    strictPort: false,
    proxy: {
      '/auth/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
      '/admin/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
      '/club-admin/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
      '/payments/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
      '/notifications/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
      '^/competitions/(\\d+|upcoming|my|past|clubs)': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => req.headers['accept']?.includes('text/html') ? req.url : null,
      },
    },
  },
});
