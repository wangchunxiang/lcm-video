<script setup lang="ts">
import SettingForm from '../../components/SettingForm.vue';
</script>

<template>
  <div class="page">
    <div class="cols">
      <div class="col-main">
        <SettingForm group="playback" />
      </div>
      <div class="col-side">
        <el-card shadow="never" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.cols {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
}
.col-main,
.col-side {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.col-main :deep(.el-card),
.col-side :deep(.el-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.col-main :deep(.el-card__body),
.col-side :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
