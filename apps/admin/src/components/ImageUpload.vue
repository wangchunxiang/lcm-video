<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';

withDefaults(
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
    <el-input
      :model-value="modelValue"
      placeholder="图片地址，或直接上传"
      clearable
      @update:model-value="emit('update:modelValue', $event)"
      @clear="clear"
    >
      <template #append>
        <label class="picker">
          <input type="file" accept="image/*" :disabled="uploading" @change="onChange" />
          {{ uploading ? '上传中' : '上传' }}
        </label>
      </template>
    </el-input>
  </div>
</template>

<style scoped>
.image-upload {
  width: 100%;
  max-width: 360px;
}
.image-upload :deep(.el-input) {
  flex: 1;
}
.picker {
  cursor: pointer;
}
.picker input {
  display: none;
}
</style>
