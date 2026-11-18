import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'lucide-react', 'jszip'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { pdf: ['jspdf', 'jspdf-autotable'], zip: ['jszip'] },
      },
    },
  },
  test: { environment: 'node' },
} as any);
