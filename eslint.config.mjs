// ESLint flat config (ESLint 9+). Lints the project's own source — the runners
// under runs/, the test suite, and the root tooling — but NOT the symlinked
// utils/ tree (that lives in its own repo with its own config) or generated/
// vendored output.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Vendored, symlinked, or generated — not ours to lint here.
    ignores: [
      'node_modules/**',
      'utils/**', // symlinked into js-core-scripts; linted in its own repo
      'conf/**', // data/config trees (data JSON, bank/cost YAML) — not source
      'coverage/**',
      'cmd/**', // loose .cmd/.js utility scripts, not part of the linted source
      '.claude/**',
      'README.md',
    ],
  },
  js.configs.recommended,
  {
    // All of the project's own JS/MJS — runners, tooling, root scripts, tests.
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2025, // allow import attributes (`import … with { type: 'json' }`)
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // CLI tools log intentionally (see CLAUDE.md logging rule)
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    // Test files exercise reflection over stub functions whose params exist to be
    // INSPECTED (e.g. `function word(fileName, chars = null) {}`), so their
    // "unused" params are expected; control-char regexes in custom matchers test
    // homoglyph/secret detection deliberately.
    files: ['tests/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-control-regex': 'off',
    },
  },
];
