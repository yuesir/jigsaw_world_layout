import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    target: 'es2022',
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      name: 'JigsawEngine',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
