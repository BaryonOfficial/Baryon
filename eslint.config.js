import { fileURLToPath } from 'url';
import { dirname } from 'path';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier'; // Add this import

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract common globals
const commonGlobals = {
  ...globals.browser,
  ...globals.node,
  console: 'readonly',
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  alert: 'readonly',
  performance: 'readonly',
  self: 'readonly',
  AudioWorkletNode: 'readonly',
};

// Base language options for both JS and TS files
const baseLanguageOptions = { ecmaVersion: 2020, globals: commonGlobals };

export default [
  // Applies to all JS/TS files—this helps eliminate repetition
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: baseLanguageOptions,
    rules: {
      'no-async-promise-executor': 'off',
      // You can add other common rules here as needed
    },
  },
  {
    ignores: [
      'dist/**',
      '**/*.glsl',
      'public/lib/**/*',
      'public/draco/**/*',
      'examples/**/*',
      '.vercel/**/*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Additional TS/TSX settings (parserOptions, plugins, etc)
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...baseLanguageOptions,
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json', './documentation/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      react,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...jsxA11y.configs.recommended.rules,
      // Critical for audio visualization performance
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '(useFrame|useAnimationFrame)$' }],
      // R3F properties
      'react/no-unknown-property': [
        'error',
        {
          ignore: [
            'attach',
            'args',
            'intensity',
            'wireframe',
            'array',
            'itemSize',
            'count',
            'transparent',
            'depthWrite',
            'blending',
            'position',
            'object',
            'toneMapped',
          ],
        },
      ],
      // Prevent common audio/WebGL context leaks
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name=/Audio(Context|Buffer|Node)|WebGLRenderer/]',
          message:
            'Audio and WebGL contexts should be created in useEffect or useLayoutEffect and properly disposed',
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*'],
    rules: { 'jsx-a11y/heading-has-content': 'off', 'react-refresh/only-export-components': 'off' },
  },
  // Relax rules for audio processing files
  {
    files: ['**/audio/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // For FFT data handling
      'no-bitwise': 'off', // For audio bit operations
    },
  },
  // Configuration for documentation files
  {
    files: ['documentation/**/*.{ts,tsx}'],
    languageOptions: {
      ...baseLanguageOptions,
      parserOptions: { project: ['./documentation/tsconfig.json'], tsconfigRootDir: __dirname },
    },
    rules: {
      'react-refresh/only-export-components': 'off', // Not needed for docs
      '@typescript-eslint/no-explicit-any': 'off', // More relaxed for docs
      'react/prop-types': 'off', // Not needed for TypeScript docs
    },
  },
  prettier,
];
