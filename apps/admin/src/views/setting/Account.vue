<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';
import { auth, logout } from '../../auth.ts';

const router = useRouter();

const form = reactive({
  nickname: auth.user?.nickname ?? '',
  expire_days: '7',
  old_password: '',
  new_password: '',
  confirm: '',
});

const loading = ref(false);
const saving = ref(false);
const savingPassword = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: (SettingField & { value: string })[] }>('/settings');
    form.expire_days = data.items.find((item) => item.key === 'login_expire_days')?.value ?? '7';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

function reset() {
  form.nickname = auth.user?.nickname ?? '';
  form.old_password = '';
  form.new_password = '';
  form.confirm = '';
  void load();
}

async function save() {
  if (!form.nickname.trim()) {
    ElMessage.warning('昵称不能为空');
    return;
  }

  saving.value = true;
  try {
    const profile = await api.put<{ nickname: string }>('/account/profile', { nickname: form.nickname.trim() });
    if (auth.user) auth.user.nickname = profile.nickname;
    await api.put('/settings', { values: { login_expire_days: form.expire_days } });
    ElMessage.success('保存成功');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function savePassword() {
  if (!form.old_password || !form.new_password) {
    ElMessage.warning('请填写原密码和新密码');
    return;
  }
  if (form.new_password !== form.confirm) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }

  savingPassword.value = true;
  try {
    await api.put('/account/password', {
      old_password: form.old_password,
      new_password: form.new_password,
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

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never" class="group-card">
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
            <el-input v-model="form.nickname" maxlength="50" style="width: 220px" />
          </div>
        </div>

        <div class="field">
          <label class="field-label">登录有效期</label>
          <div class="field-ctrl">
            <el-input v-model="form.expire_days" style="width: 220px">
              <template #append>天</template>
            </el-input>
            <div class="field-hint">登录状态保持的天数，默认 7 天</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">原密码</label>
          <div class="field-ctrl">
            <el-input
              v-model="form.old_password"
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
              v-model="form.new_password"
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
              v-model="form.confirm"
              type="password"
              show-password
              autocomplete="new-password"
              style="width: 220px"
            />
            <div class="field-hint">修改密码后需要重新登录</div>
          </div>
        </div>
      </div>

      <div class="card-foot">
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button :loading="savingPassword" @click="savePassword">修改密码</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}
.group-card :deep(.el-card__body) {
  padding: 16px 24px 0;
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
  padding: 14px 0 16px 116px;
  border-top: 1px solid var(--el-border-color);
}
</style>
