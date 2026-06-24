const js = require("@eslint/js");
const globals = require("globals");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const reactRefreshPluginModule = require("eslint-plugin-react-refresh");
const reactRefreshPlugin =
  reactRefreshPluginModule.default ?? reactRefreshPluginModule;

function cleanGlobals(source) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key.trim(), value]),
  );
}

module.exports = [
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/.vite/**",
      "**/public/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.vercel/**",
    ],
  },
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...cleanGlobals(globals.browser),
      },
    },
    plugins: {
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefreshPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "no-unused-vars": ["error", { varsIgnorePattern: "React" }],
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.config.{js,cjs,mjs}", "packages/config/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...cleanGlobals(globals.node),
      },
    },
  }
];
