<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';
import { auth, logout } from '../../auth.ts';

const router = useRouter();

const profile = reactive({ nickname: auth.user?.nickname ?? '' });
const password = reactive({ old_password: '', new_password: '', confirm: '' });
const expireDays = ref('');
const savingProfile = ref(false);
const savingPassword = ref(false);

async function loadSettings() {
  try {
    const data = await api.get<{ items: (SettingField & { value: string })[] }>('/settings');
    expireDays.value = data.items.find((item) => item.key === 'login_expire_days')?.value ?? '7';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  }
}

async function saveProfile() {
  if (!profile.nickname.trim()) {
    ElMessage.warning('昵称不能为空');
    return;
  }
  savingProfile.value = true;
  try {
    const result = await api.put<{ nickname: string }>('/account/profile', { nickname: profile.nickname.trim() });
    if (auth.user) auth.user.nickname = result.nickname;
    ElMessage.success('昵称已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  if (!password.old_password || !password.new_password) {
    ElMessage.warning('请填写原密码和新密码');
    return;
  }
  if (password.new_password !== password.confirm) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }

  savingPassword.value = true;
  try {
    await api.put('/account/password', {
      old_password: password.old_password,
      new_password: password.new_password,
    });
    ElMessage.success('密码已修改，请重新登录');
    await logout();
    await router.replace('/login');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改失败');
  } finally {
    savingPassword.value = false;
  }
}

async function saveExpireDays() {
  try {
    await api.put('/settings', { values: { login_expire_days: expireDays.value } });
    ElMessage.success('已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <div class="account">
    <el-card shadow="never" header="账号信息">
      <el-form label-width="120px" class="form">
        <el-form-item label="登录账号">
          <el-input :model-value="auth.user?.username ?? ''" disabled />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="profile.nickname" maxlength="50" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" header="修改密码">
      <el-form label-width="120px" class="form">
        <el-form-item label="原密码">
          <el-input v-model="password.old_password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="password.new_password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="password.confirm" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="savingPassword" @click="savePassword">修改密码</el-button>
          <span class="hint">修改后需要重新登录</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" header="登录有效期">
      <el-form label-width="120px" class="form">
        <el-form-item label="有效期（天）">
          <el-input v-model="expireDays" class="short" />
          <span class="hint">登录 cookie 的有效天数，默认 7 天</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveExpireDays">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form {
  max-width: 560px;
}
.short {
  width: 120px;
}
.hint {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
