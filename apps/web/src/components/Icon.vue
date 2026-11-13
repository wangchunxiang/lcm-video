<script setup lang="ts">
/**
 * 内联线性图标（24 viewBox，颜色跟随 currentColor），与 v2 主题 partials/icon.liquid 一致。
 * 尺寸默认 18px；需要别的尺寸传 size。
 */
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <template v-if="name === 'home'">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </template>

    <template v-else-if="name === 'film'">
      <rect x="2" y="2" width="20" height="20" rx="2.2" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
    </template>

    <template v-else-if="name === 'tv'">
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <polyline points="17 2 12 7 7 2" />
    </template>

    <template v-else-if="name === 'clapper'">
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.4Z" />
      <path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </template>

    <template v-else-if="name === 'anime'">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </template>

    <template v-else-if="name === 'chevron-down'">
      <path d="m6 9 6 6 6-6" stroke-width="2" />
    </template>

    <template v-else-if="name === 'chevron-left'">
      <path d="m15 18-6-6 6-6" stroke-width="2" />
    </template>

    <template v-else-if="name === 'chevron-right'">
      <path d="m9 18 6-6-6-6" stroke-width="2" />
    </template>

    <template v-else-if="name === 'close'">
      <path d="M18 6 6 18M6 6l12 12" stroke-width="2" />
    </template>

    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" stroke-width="2" />
    </template>

    <template v-else-if="name === 'menu'">
      <path d="M4 6h16M4 12h16M4 18h16" stroke-width="2" />
    </template>
  </svg>
</template>
