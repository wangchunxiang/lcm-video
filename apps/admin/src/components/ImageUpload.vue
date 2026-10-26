<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tip?: string;
  }>(),
  { tip: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const uploading = ref(false);

async function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  uploading.value = true;
  try {
    const result = await api.upload(file);
    emit('update:modelValue', result.url);
    ElMessage.success('上传成功');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '上传失败');
  } finally {
    uploading.value = false;
  }
}

function clear() {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="image-upload">
    <div class="preview" v-if="modelValue">
      <el-image :src="modelValue" fit="contain" class="thumb" />
    </div>
    <div class="actions">
      <label class="picker">
        <input type="file" accept="image/*" :disabled="uploading" @change="onChange" />
        <el-button type="primary" plain :loading="uploading" size="small">选择图片</el-button>
      </label>
      <el-button v-if="modelValue" size="small" @click="clear">清除</el-button>
      <span v-if="tip" class="tip">{{ tip }}</span>
    </div>
    <el-input
      :model-value="modelValue"
      placeholder="也可以直接填写图片地址"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.image-upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.preview .thumb {
  max-width: 160px;
  max-height: 60px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 4px;
  background: var(--el-fill-color-light);
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker input {
  display: none;
}
.tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
