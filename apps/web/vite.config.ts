import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const envDir = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'API_');
  const port = Number(process.env.API_PORT ?? env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API_PORT');
  return { plugins: [react(), tailwindcss()], envDir,
    server: { proxy: { '/api': { target: `http://127.0.0.1:${port}` } } } };
});
