/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In development the UI calls /api on its own origin and Vite forwards it to the backend.
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
