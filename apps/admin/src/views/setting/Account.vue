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
const expireDays = ref('7');
const loading = ref(false);
const savingProfile = ref(false);
const savingPassword = ref(false);
const savingExpire = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: (SettingField & { value: string })[] }>('/settings');
    expireDays.value = data.items.find((item) => item.key === 'login_expire_days')?.value ?? '7';
    profile.nickname = auth.user?.nickname ?? '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
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
  savingExpire.value = true;
  try {
    await api.put('/settings', { values: { login_expire_days: expireDays.value } });
    ElMessage.success('已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    savingExpire.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never">
      <template #header>账号信息</template>
      <div class="body">
        <div class="field">
          <label class="field-label">登录账号</label>
          <div class="field-ctrl">
            <el-input :model-value="auth.user?.username ?? ''" disabled style="width: 220px" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">昵称</label>
          <div class="field-ctrl">
            <el-input v-model="profile.nickname" maxlength="50" style="width: 220px" />
          </div>
        </div>
      </div>
      <div class="card-foot">
        <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>修改密码</template>
      <div class="body">
        <div class="field">
          <label class="field-label">原密码</label>
          <div class="field-ctrl">
            <el-input
              v-model="password.old_password"
              type="password"
              show-password
              autocomplete="current-password"
              style="width: 220px"
            />
          </div>
        </div>
        <div class="field">
          <label class="field-label">新密码</label>
          <div class="field-ctrl">
            <el-input
              v-model="password.new_password"
              type="password"
              show-password
              autocomplete="new-password"
              style="width: 220px"
            />
          </div>
        </div>
        <div class="field">
          <label class="field-label">确认新密码</label>
          <div class="field-ctrl">
            <el-input
              v-model="password.confirm"
              type="password"
              show-password
              autocomplete="new-password"
              style="width: 220px"
            />
            <div class="field-hint">修改后需要重新登录</div>
          </div>
        </div>
      </div>
      <div class="card-foot">
        <el-button type="primary" :loading="savingPassword" @click="savePassword">修改密码</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>登录有效期</template>
      <div class="body">
        <div class="field">
          <label class="field-label">有效期</label>
          <div class="field-ctrl">
            <el-input v-model="expireDays" style="width: 220px">
              <template #append>天</template>
            </el-input>
            <div class="field-hint">登录状态保持的天数，默认 7 天</div>
          </div>
        </div>
      </div>
      <div class="card-foot">
        <el-button type="primary" :loading="savingExpire" @click="saveExpireDays">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.body {
  max-width: 860px;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0;
}
.field-label {
  flex: none;
  width: 104px;
  text-align: right;
  line-height: 32px;
  color: var(--el-text-color-regular);
}
.field-ctrl {
  flex: 1;
  min-width: 0;
}
.field-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-foot {
  display: flex;
  gap: 10px;
  margin: 16px 0 0;
  padding: 14px 0 0 116px;
  border-top: 1px solid var(--el-border-color);
}
</style>
