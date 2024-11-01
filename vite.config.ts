import { defineConfig, UserConfig } from 'vite';
import path from 'path';
import { transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react-swc';
import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig((): UserConfig => {
  const isHttps = process.env.HTTPS === 'true';

  const config = {
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      host: true, // Open to local network and display URL
      https: isHttps ? {} : false, // Convert boolean to proper https config
      open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env), // Open if it's not a CodeSandbox
    },
    esbuild: {
      drop: ['console' as const, 'debugger' as const],
      dropLabels: ['DEBUG'],
    },
    build: {
      outDir: 'dist', // Output in the dist/ folder
      emptyOutDir: true, // Empty the folder first
      sourcemap: 'hidden' as const, // Type assertion to match allowed values
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      react({
        // Enable TypeScript support
        tsDecorators: true,
        plugins: [],
      }),
      glsl(),
      topLevelAwait({
        promiseExportName: '__tla',
        promiseImportName: (i) => `__tla_${i}`,
      }),
      isHttps && basicSsl(),
      {
        name: 'load+transform-js-files-as-jsx',
        async transform(code, id) {
          if (!id.match(/src\/.*\.(js|jsx|ts|tsx)$/)) return null;

          return transformWithEsbuild(code, id, {
            loader: id.match(/\.[jt]sx?$/) ? 'tsx' : 'ts',
            jsx: 'automatic',
          });
        },
      },
    ],
    // Add TypeScript resolution
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
  };

  return config;
});
