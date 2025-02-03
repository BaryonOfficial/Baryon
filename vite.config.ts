import path from 'path';
import {
  defineConfig,
  Plugin,
  ServerOptions,
  TransformResult,
  UserConfig,
  transformWithEsbuild,
} from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';
import glsl from 'vite-plugin-glsl';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig((): UserConfig => {
  const isHttps = process.env.HTTPS === 'true';

  const serverConfig: ServerOptions = {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    host: '0.0.0.0',
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
  };

  // Only add HTTPS configuration if enabled
  if (isHttps) {
    serverConfig.https = {};
  }

  return {
    server: serverConfig,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: 'hidden',
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
    },
    optimizeDeps: {
      include: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
    },
    plugins: [
      react({
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
        async transform(code: string, id: string): Promise<TransformResult | null> {
          if (!id.match(/src\/.*\.(js|jsx|ts|tsx)$/)) return null;
          return transformWithEsbuild(code, id, {
            loader: id.match(/\.[jt]sx?$/) ? 'tsx' : 'ts',
            jsx: 'automatic',
          });
        },
      } as Plugin,
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.glsl'],
    },
    // test: {
    //   globals: true,
    //   environment: 'jsdom',
    //   setupFiles: ['./src/test/setup.ts'],
    //   include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    //   exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    //   coverage: {
    //     provider: 'v8',
    //     reporter: ['text', 'json', 'html'],
    //     exclude: [
    //       'node_modules/',
    //       'src/test/',
    //     ]
    //   }
    // },
  };
});
