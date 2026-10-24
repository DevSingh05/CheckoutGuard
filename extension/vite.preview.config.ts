import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'WXT_'],
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    outDir: '.output/preview',
    emptyOutDir: false,
    rollupOptions: { input: 'preview.html' },
  },
});
