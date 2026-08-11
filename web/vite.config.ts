import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['farfalle.agg.local', 'localhost'],
    proxy: {
      '/api': 'http://localhost:4000',
      '/files': 'http://localhost:4000',
    },
  },
});
