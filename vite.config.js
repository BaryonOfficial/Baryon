import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';

export default {
  root: 'src/',
  publicDir: '../static/',
  base: './',
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 'Cache-Control': 'no-cache, no-store, must-revalidate',
      // Pragma: 'no-cache',
      // Expires: '0',
    },
    host: false, // Open to local network and display URL
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env), // Open if it's not a CodeSandbox
  },
  build: {
    outDir: '../dist', // Output in the dist/ folder
    emptyOutDir: true, // Empty the folder first
    sourcemap: true, // Add sourcemap
    // target: 'esnext',
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
};
