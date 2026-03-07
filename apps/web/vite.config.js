import { defineConfig } from 'vite';
import path from 'path';
import { createBaseViteConfig } from '@baryon/config';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  const isHttps = process.env.HTTPS === 'true';
  const base = createBaseViteConfig();

  return {
    ...base,
    plugins: [
      tailwindcss(),
      ...base.plugins,
      isHttps && basicSsl(),
    ].filter(Boolean),
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      host: true,
      https: isHttps,
      open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
    },
    build: {
      ...base.build,
      outDir: 'dist',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
