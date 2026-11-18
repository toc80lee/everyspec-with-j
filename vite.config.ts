import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'firebase-vendor',
                test: /node_modules\/(firebase|@firebase)\//,
                priority: 30,
              },
              {
                name: 'charts-vendor',
                test: /node_modules\/(recharts|d3-|victory-vendor)\//,
                priority: 25,
              },
              {
                name: 'react-vendor',
                test: /node_modules\/(react|react-dom|scheduler)\//,
                priority: 20,
              },
              {
                name: 'ui-vendor',
                test: /node_modules\/(lucide-react|motion|framer-motion)\//,
                priority: 15,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
