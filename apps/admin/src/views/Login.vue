<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';
import { login } from '../auth.ts';
import { stripBase } from '../session.ts';

const router = useRouter();
const route = useRoute();

/** 与侧栏同一张图，路径跟随 admin 的 base（构建后是 /admin/） */
const logoUrl = `${import.meta.env.BASE_URL}img/logo.png`;

const form = ref({ username: 'admin', password: '', captchaCode: '' });
const loading = ref(false);

/** 验证码：id 是一次性令牌，答案只在服务端；这里拿到的只是 SVG */
const captchaId = ref('');
const captchaSvg = ref('');
const captchaLoading = ref(false);
/** 用 data URL 交给 <img>，比 v-html 更安全（SVG 里的脚本/事件不会执行） */
const captchaSrc = computed(() =>
  captchaSvg.value === '' ? '' : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg.value)}`,
);

async function loadCaptcha(): Promise<void> {
  captchaLoading.value = true;
  try {
    const data = await api.get<{ id: string; svg: string }>('/auth/captcha');
    captchaId.value = data.id;
    captchaSvg.value = data.svg;
    form.value.captchaCode = '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '验证码加载失败');
  } finally {
    captchaLoading.value = false;
  }
}

onMounted(() => {
  void loadCaptcha();
});

async function onSubmit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  if (!form.value.captchaCode.trim()) {
    ElMessage.warning('请输入验证码');
    return;
  }
  loading.value = true;
  try {
    await login(form.value.username.trim(), form.value.password, captchaId.value, form.value.captchaCode);
    ElMessage.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? stripBase(route.query.redirect) : '/dashboard';
    await router.replace(redirect);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败');
    // 服务端校验后就把令牌作废了，失败一定要换一张，否则重试用的是废票
    void loadCaptcha();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 背景装饰：两团主色光斑 + 细网格，纯 CSS，不额外请求图片 -->
    <div class="glow glow-a" />
    <div class="glow glow-b" />
    <div class="grid" />

    <main class="login-card">
      <header class="brand">
        <img :src="logoUrl" alt="蓝草莓影视" class="brand-logo" />
        <div class="brand-text">
          <h1>蓝草莓影视</h1>
          <p>后台管理系统</p>
        </div>
      </header>

      <el-form :model="form" label-position="top" class="form" @submit.prevent="onSubmit">
        <el-form-item label="账号">
          <el-input
            v-model="form.username"
            size="large"
            placeholder="请输入账号"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            placeholder="请输入密码"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-form-item label="验证码">
          <div class="captcha-row">
            <el-input
              v-model="form.captchaCode"
              size="large"
              placeholder="请输入右侧字符"
              maxlength="8"
              autocomplete="off"
              @keyup.enter="onSubmit"
            />
            <button
              type="button"
              class="captcha-img"
              title="看不清？点击刷新"
              :disabled="captchaLoading"
              @click="loadCaptcha"
            >
              <img v-if="captchaSrc" :src="captchaSrc" alt="验证码" width="108" height="38" />
              <span v-else class="captcha-placeholder">{{ captchaLoading ? '加载中…' : '点击加载' }}</span>
            </button>
          </div>
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" native-type="submit">
          登录
        </el-button>
      </el-form>

      <footer class="footer">仅限管理员访问 · 蓝草莓影视</footer>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(1200px 600px at 15% -10%, #1e3a8a 0%, transparent 60%),
    radial-gradient(900px 500px at 100% 110%, #0e7490 0%, transparent 55%),
    linear-gradient(160deg, #0b1220 0%, #11192a 55%, #0b1220 100%);
}

/* 光斑：模糊的大圆，给深色背景一点层次 */
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
}
.glow-a {
  width: 420px;
  height: 420px;
  top: -120px;
  left: -80px;
  background: #3b82f6;
  opacity: 0.5;
}
.glow-b {
  width: 360px;
  height: 360px;
  right: -100px;
  bottom: -120px;
  background: #06b6d4;
  opacity: 0.35;
}

/* 细网格：24px 一格，透明度极低，边缘用遮罩淡出 */
.grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(70% 60% at 50% 45%, #000 0%, transparent 100%);
}

.login-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  padding: 32px 28px 20px;
  border-radius: 16px;
  background: var(--el-bg-color, #fff);
  box-shadow:
    0 24px 60px rgba(8, 12, 24, 0.45),
    0 2px 8px rgba(8, 12, 24, 0.2);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.brand-logo {
  width: 44px;
  height: 44px;
  flex: none;
}
.brand-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary);
}
.brand-text p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.form {
  padding-top: 20px;
}
.form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.form :deep(.el-input__wrapper) {
  border-radius: 10px;
}
.form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.captcha-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.captcha-img {
  flex: none;
  width: 108px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: #f4f7fb;
  cursor: pointer;
  line-height: 0;
}
.captcha-img:disabled {
  cursor: progress;
}
.captcha-placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.submit {
  width: 100%;
  height: 44px;
  margin-top: 6px;
  border-radius: 10px;
  font-size: 15px;
  letter-spacing: 4px;
}

.footer {
  margin-top: 22px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
