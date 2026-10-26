<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  AlarmClock,
  CollectionTag,
  DataBoard,
  Download,
  Film,
  Link,
  MagicStick,
  Monitor,
  Operation,
  SetUp,
  Setting,
  Share,
  Tickets,
  User,
  VideoCamera,
} from '@element-plus/icons-vue';
import { menus } from '../menu.ts';

/** 图标名到组件的显式映射，避免运行时按字符串解析 */
const iconMap: Record<string, unknown> = {
  AlarmClock,
  CollectionTag,
  DataBoard,
  Download,
  Film,
  Link,
  MagicStick,
  Monitor,
  Operation,
  SetUp,
  Setting,
  Share,
  Tickets,
  User,
  VideoCamera,
};
import { auth, logout } from '../auth.ts';

const route = useRoute();
const router = useRouter();

const activeMenu = computed(() => route.path);
const currentTitle = computed(() => String(route.meta.title ?? ''));
const nickname = computed(() => auth.user?.nickname || auth.user?.username || '管理员');

async function onLogout() {
  await logout();
  ElMessage.success('已退出登录');
  await router.replace('/login');
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">蓝草莓影视</div>
      <el-menu :default-active="activeMenu" router class="menu">
        <template v-for="item in menus" :key="item.path">
          <el-sub-menu v-if="item.children?.length" :index="item.path">
            <template #title>
              <el-icon><component :is="iconMap[item.icon ?? '']" /></el-icon>
              <span>{{ item.title }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
              <el-icon v-if="child.icon"><component :is="iconMap[child.icon]" /></el-icon>
              <span>{{ child.title }}</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="iconMap[item.icon ?? '']" /></el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="crumb">{{ currentTitle }}</div>
        <el-dropdown @command="onLogout">
          <span class="user">
            <el-icon><User /></el-icon>
            {{ nickname }}
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
  /* 左侧 logo 与顶栏共用同一高度 */
  --lcm-header-height: 60px;
}
.aside {
  --el-menu-bg-color: #1f2d3d;
  --el-menu-text-color: #c0c4cc;
  --el-menu-hover-bg-color: #16202b;
  --el-menu-active-color: var(--el-color-primary-light-3);
  background: var(--el-menu-bg-color);
  overflow-y: auto;
}
.logo {
  height: var(--lcm-header-height);
  line-height: var(--lcm-header-height);
  text-align: center;
  color: var(--el-color-white);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.menu {
  border-right: none;
}
.menu :deep(.el-sub-menu__title .el-icon),
.menu :deep(.el-menu-item .el-icon) {
  flex: none;
  /* 侧栏展开子菜单时会动画改变高度，Chromium 会重绘整片区域，
     SVG 图标偶尔出现一帧空白。单独提升为合成层可避免被重绘。 */
  transform: translateZ(0);
}
.menu :deep(.el-sub-menu__title .el-icon svg),
.menu :deep(.el-menu-item .el-icon svg) {
  display: block;
}
.header {
  height: var(--lcm-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}
.crumb {
  font-size: 15px;
  color: var(--el-text-color-primary);
}
.user {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-primary);
  outline: none;
}
.main {
  background: var(--el-bg-color-page);
  padding: 16px;
}
</style>
