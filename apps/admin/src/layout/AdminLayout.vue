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
      <el-menu :default-active="activeMenu" router class="menu" background-color="#1f2d3d" text-color="#c0c4cc" active-text-color="#ffd04b">
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
}
.aside {
  background: #1f2d3d;
  overflow-y: auto;
}
.logo {
  height: 56px;
  line-height: 56px;
  text-align: center;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.menu {
  border-right: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.crumb {
  font-size: 15px;
  color: #303133;
}
.user {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #303133;
  outline: none;
}
.main {
  background: #f5f7fa;
  padding: 16px;
}
</style>
