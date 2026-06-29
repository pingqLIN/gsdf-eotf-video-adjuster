import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const projectRoot = path.resolve(__dirname, '.');

  return {
    root: projectRoot,
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.'),
      },
    },
    server: {
      allowedHosts: ['.loca.lt', '.trycloudflare.com'],
      // Set DISABLE_HMR=true in automation when file watching should stay quiet.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
