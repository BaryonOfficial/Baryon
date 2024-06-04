import { defineConfig } from 'vite';
import postcssConfig from './postcss.config.js';
import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  css: {
    postcss: postcssConfig,
  },
  root: './',
  publicDir: 'static',
  base: './',
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 'Cache-Control': 'public, max-age=31536000, immutable', // for prod
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
    host: true, // Open to local network and display URL
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env), // Open if it's not a CodeSandbox
  },
  build: {
    outDir: 'dist', // Output in the dist/ folder
    emptyOutDir: true, // Empty the folder first
    sourcemap: true, // Add sourcemap
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    rollupOptions: {
      output: {
        entryFileNames: `[name].[hash].js`,
        chunkFileNames: `[name].[hash].js`,
        assetFileNames: `[name].[hash].[ext]`,
      },
    },
    // target: 'esnext',
  },
  optimizeDeps: {
    include: ['@ffmpeg/ffmpeg'],
  },
  plugins: [
    glsl(),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
  ],
});
