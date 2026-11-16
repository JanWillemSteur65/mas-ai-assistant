import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // Carbon v11 requires modern Sass API (quietDeps suppresses Carbon's own deprecation warnings)
        api: 'modern-compiler',
        quietDeps: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3737',
    },
  },
});
