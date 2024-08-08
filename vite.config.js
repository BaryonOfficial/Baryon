import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

import { transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react-swc';
import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    host: true, // Open to local network and display URL
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '192.168.1.69-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '192.168.1.69.pem')),
    },
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env), // Open if it's not a CodeSandbox
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    outDir: 'dist', // Output in the dist/ folder
    emptyOutDir: true, // Empty the folder first
    sourcemap: true, // Add sourcemap
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
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    // .js file support as if it was JSX
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
});
