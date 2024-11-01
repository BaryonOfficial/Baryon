module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended', // Add this
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'public/*', 'examples'],
  parser: '@typescript-eslint/parser', // Add this
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'], // Add this
  },
  settings: { react: { version: '18.2' } },
  plugins: [
    'react-refresh',
    'react-hooks',
    '@typescript-eslint', // Add this
  ],
  rules: {
    'react-hooks/exhaustive-deps': 'warn', // Checks effect dependencies
    'react/jsx-no-target-blank': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'react/no-unknown-property': ['error', { ignore: ['attach', 'args'] }],
    'no-unused-vars': ['error', { varsIgnorePattern: 'React' }],
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error', // Checks rules of Hooks
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: 'React' }],
  },
};
