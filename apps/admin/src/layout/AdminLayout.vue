<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { menus } from '../menu.ts';
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
      <el-menu :default-active="activeMenu" router>
        <template v-for="item in menus" :key="item.path">
          <el-sub-menu v-if="item.children?.length" :index="item.path">
            <template #title>
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
              {{ child.title }}
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
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
