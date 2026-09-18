import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ command, mode }) => {
  // The API address is baked into the bundle at build time, so a missing
  // VITE_API_URL ships a site that quietly calls localhost. Locally that is
  // the documented default; on Render (which sets RENDER=true) it is a
  // broken deploy, so fail the build instead.
  if (command === 'build' && process.env.RENDER && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error(
      'VITE_API_URL is not set. In Render open uzz-crm-web -> Environment and add ' +
        'VITE_API_URL=https://<uzz-crm-api address>/api/v1, then redeploy.',
    );
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, strictPort: true },
    // Same security headers as the Render static site (render.yaml), to catch CSP breakage locally.
    preview: {
      port: 4173,
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'sha256-JZ1WohQZVuVaNcSSO/3gmm8hsY5WS3BBNF3bgM6NwPA='; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://localhost:3000 https://*.onrender.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
  };
});
