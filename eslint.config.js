import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-undef': 'error',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
    },
  },
  {
    files: ['test/**/*.mjs', 'test/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
