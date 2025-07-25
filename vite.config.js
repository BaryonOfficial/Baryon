import { defineConfig } from 'vite';
import path from 'path';

import { transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react-swc';
import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig(() => {
  const isHttps = process.env.HTTPS === 'true';

  const config = {
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      host: true, // Open to local network and display URL
      https: isHttps,
      open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env), // Open if it's not a CodeSandbox
    },
    esbuild: {
      drop: ['console', 'debugger'],
    },
    build: {
      outDir: 'dist', // Output in the dist/ folder
      emptyOutDir: true, // Empty the folder first
      sourcemap: 'hidden', // Add sourcemap
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      react(),
      glsl(),
      topLevelAwait({
        promiseExportName: '__tla',
        promiseImportName: (i) => `__tla_${i}`,
      }),
      isHttps && basicSsl(),
      {
        name: 'load+transform-js-files-as-jsx',
        async transform(code, id) {
          if (!id.match(/src\/.*\.js$/)) return null;

          return transformWithEsbuild(code, id, {
            loader: 'jsx',
            jsx: 'automatic',
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };

  return config;
});
