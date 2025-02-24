import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';

export default [
  // Base configuration
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    // Comprehensive ignore patterns
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs',
      'vite.config.*',
      '.eslintrc.*',
    ],
  },
  // React configuration
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Critical for audio visualization performance
      'react-hooks/exhaustive-deps': [
        'warn',
        {
          additionalHooks: '(useFrame|useAnimationFrame)$',
        },
      ],

      // R3F properties - disable the rule since TypeScript handles prop checking
      'react/no-unknown-property': 'off',

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
    settings: {
      react: {
        version: 'detect', // Updated to match your React version
      },
    },
  },
];
