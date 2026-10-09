import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { localLibraryPlugin } from './storage/dev-server';

export default defineConfig({
  base: './',
  plugins: [react(), localLibraryPlugin()],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  build: { target: 'es2022' },
});
