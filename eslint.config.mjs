import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.shots/**',
      'docs/**',
      'tmp/**',
      'logs/**',
      'uploads/**',
      '参考项目/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // .vue：模板 + <script setup lang="ts">。用 essential 而不是 recommended：
  // recommended 里带着 max-attributes-per-line / html-indent 这类排版规则，会让现有
  // 42 个 SFC 一次性冒 2200+ 条警告（仓库没装 prettier，属性换行风格是手写的），
  // 淹掉真正有价值的报错。essential 只管正确性问题，当前基线是 0 警告。
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      // 页面组件按路由文件名命名（Dashboard/Login/Sources…），这里的单文件名不会与
      // HTML 元素冲突；该规则只会每加一个页面报一次，没有实际收益。
      'vue/multi-word-component-names': 'off',
      // 仅 1 处合法用途（DetailView 的二维码 SVG）已就地 disable；其余 v-html 一律拦截，
      // 防的是把接口返回的富文本/标题直接当 HTML 插进 DOM。
      'vue/no-v-html': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // 前端两处会用到浏览器全局（document、window、localStorage…）；不给的话 .vue 里
  // js.configs.recommended 的 no-undef 会全线报错。
  {
    files: ['apps/admin/**/*.{ts,vue}', 'apps/web/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
