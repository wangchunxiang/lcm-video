<script setup lang="ts">
import SettingForm from '../../components/SettingForm.vue';
</script>

<template>
  <div class="page">
    <SettingForm group="playback" label-width="120px" size="large" />
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page :deep(.el-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
