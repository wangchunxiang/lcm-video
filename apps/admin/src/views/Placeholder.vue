<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => String(route.meta.title ?? '功能'));
</script>

<template>
  <el-card shadow="never">
    <el-empty :description="`${title} · 开发中`" />
  </el-card>
</template>
