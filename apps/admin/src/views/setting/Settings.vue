<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SettingForm from '../../components/SettingForm.vue';
import Account from './Account.vue';

const TAB_NAMES = ['base', 'site', 'playback', 'account'] as const;

const route = useRoute();
const router = useRouter();

const active = computed({
  get() {
    const tab = String(route.query.tab ?? '');
    return (TAB_NAMES as readonly string[]).includes(tab) ? tab : 'base';
  },
  set(value: string) {
    router.replace({ query: { ...route.query, tab: value } });
  },
});
</script>

<template>
  <div class="page">
    <el-tabs v-model="active" class="tabs">
      <el-tab-pane label="基础设置" name="base" lazy>
        <SettingForm group="base" />
      </el-tab-pane>
      <el-tab-pane label="站点设置" name="site" lazy>
        <SettingForm group="site" />
      </el-tab-pane>
      <el-tab-pane label="播放设置" name="playback" lazy>
        <SettingForm group="playback" />
      </el-tab-pane>
      <el-tab-pane label="账号设置" name="account" lazy>
        <Account />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
