const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      '.expo/**',
      'android/**',
      'ios/**',
    ],
  },
  {
    settings: {
      // Virtual module provided by the Cloudflare Workers runtime.
      'import/core-modules': ['cloudflare:workers'],
    },
    rules: {
      // require() is the standard RN/Expo pattern for bundled assets and
      // optional native modules that must not load in Expo Go / tests.
      '@typescript-eslint/no-require-imports': 'off',
      // React Compiler rules — the codebase predates them and fixing the
      // flagged patterns (Animated useRef().current, Date.now() ids, hydrate
      // effects) needs real refactors. Tracked in TECH_DEBT.md.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**', '**/__mocks__/**', '**/*.test.{js,ts,tsx}'],
    languageOptions: {
      globals: { jest: 'readonly' },
    },
    rules: {
      // Jest tests interleave jest.mock() setup with imports on purpose;
      // reordering imports above mock factories breaks hoisting (TDZ).
      'import/first': 'off',
    },
  },
]);
