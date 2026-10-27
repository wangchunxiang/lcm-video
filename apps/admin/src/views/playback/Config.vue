<script setup lang="ts">
import { ref } from 'vue';
import SettingForm from '../../components/SettingForm.vue';
import PlayerPreview from '../../components/PlayerPreview.vue';

const playerType = ref('dplayer');

function onChange(key: string, value: string) {
  if (key === 'player_type') playerType.value = value || 'dplayer';
}
</script>

<template>
  <div class="page">
    <div class="cols">
      <div class="col-main">
        <SettingForm group="playback" label-width="120px" @change="onChange">
          <template #top>
            <PlayerPreview :player="playerType" />
          </template>
        </SettingForm>
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.col-main,
.col-side {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.col-main :deep(.setting-form) {
  max-width: none;
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
