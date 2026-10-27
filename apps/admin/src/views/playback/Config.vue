<script setup lang="ts">
import { ref } from 'vue';
import SettingForm from '../../components/SettingForm.vue';
import PlayerPreview from '../../components/PlayerPreview.vue';

const options = ref<Record<string, string>>({});

function onChange(key: string, value: string) {
  options.value = { ...options.value, [key]: value };
}
</script>

<template>
  <div class="page">
    <SettingForm group="playback" label-width="120px" @change="onChange">
      <template #top>
        <PlayerPreview :options="options" />
      </template>
    </SettingForm>
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
