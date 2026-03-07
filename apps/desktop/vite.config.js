import { defineConfig } from 'vite';
import path from 'path';
import { createBaseViteConfig } from '@baryon/config';

export default defineConfig(() => {
  const base = createBaseViteConfig();

  return {
    ...base,
    plugins: [...base.plugins],
    // COOP/COEP are set via tauri.conf.json app.security.headers
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: '127.0.0.1',
      hmr: { protocol: 'ws', host: '127.0.0.1', port: 1421 },
    },
    build: {
      ...base.build,
      outDir: 'dist',
      target: ['es2021', 'chrome100', 'safari13'],
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_DEBUG,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    envPrefix: ['VITE_', 'TAURI_'],
  };
});
