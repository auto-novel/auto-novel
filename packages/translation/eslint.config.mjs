import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';

export default [
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    ignores: ['dist/'],
  },
  {
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
