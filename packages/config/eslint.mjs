import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/schema.d.ts', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['apps/web/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } },
  { files: ['**/*.ts','**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } }
];
