import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/Frames/',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'demo.html') },
  },
});
