<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { login } from '../auth.ts';

const router = useRouter();
const route = useRoute();

const form = ref({ username: 'admin', password: '' });
const loading = ref(false);

async function onSubmit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await login(form.value.username.trim(), form.value.password);
    ElMessage.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.replace(redirect);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <div class="brand">
        <h1>蓝草莓影视</h1>
        <p>后台管理系统</p>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入账号" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" native-type="submit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #2b3a4d 100%);
}
.login-card {
  width: 360px;
  padding: 8px 12px 16px;
}
.brand {
  text-align: center;
  margin-bottom: 20px;
}
.brand h1 {
  margin: 0;
  font-size: 22px;
  color: #303133;
}
.brand p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #909399;
}
.submit {
  width: 100%;
  margin-top: 8px;
}
</style>
