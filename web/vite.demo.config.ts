import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/Frames/',
  // Compile a separate static build of the production frontend. All api()
  // requests are served from sample data and every mutation is rejected.
  define: { 'import.meta.env.VITE_FRAMES_DEMO': JSON.stringify('true') },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'demo.html') },
  },
});
