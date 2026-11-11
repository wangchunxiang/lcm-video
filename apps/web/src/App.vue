<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="site">
    <header class="site-header">
      <RouterLink class="logo" to="/">LCM 视频</RouterLink>
      <nav class="nav">
        <RouterLink to="/list/all">全部影片</RouterLink>
        <RouterLink to="/search">搜索</RouterLink>
      </nav>
    </header>
    <main class="site-main">
      <RouterView />
    </main>
  </div>
</template>

<style>
:root {
  color-scheme: light;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  color: #1f2328;
  background: #f6f7f9;
}

body {
  margin: 0;
}

.site-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.logo {
  font-weight: 600;
  font-size: 18px;
  color: #111827;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 16px;
}

.nav a {
  color: #4b5563;
  text-decoration: none;
}

.nav a.router-link-active {
  color: #2563eb;
}

.site-main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}

.page-title {
  font-size: 20px;
  margin: 0 0 8px;
}

.hint {
  color: #6b7280;
  font-size: 14px;
}

.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
}

.card a {
  color: #111827;
  text-decoration: none;
}
</style>
