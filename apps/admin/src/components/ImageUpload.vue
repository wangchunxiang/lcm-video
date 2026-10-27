<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tip?: string;
    shape?: 'poster' | 'square' | 'circle';
  }>(),
  { tip: '', shape: 'square' },
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
    <div class="thumb-box">
      <el-image
        v-if="modelValue"
        :src="modelValue"
        fit="cover"
        class="thumb"
        :class="shape"
        :preview-src-list="[modelValue]"
        preview-teleported
        hide-on-click-modal
        :preview-index="0"
      />
      <div v-else class="thumb placeholder" :class="shape">
        {{ shape === 'circle' ? 'ICO' : 'LOGO' }}
      </div>
    </div>

    <div class="main">
      <div class="actions">
        <label class="picker">
          <input type="file" accept="image/*" :disabled="uploading" @change="onChange" />
          <el-button :loading="uploading" size="small">上传图片</el-button>
        </label>
        <el-button v-if="modelValue" size="small" link @click="clear">清除</el-button>
      </div>
      <el-input
        :model-value="modelValue"
        placeholder="也可以直接填写图片地址"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.image-upload {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
}
.thumb-box {
  flex: none;
}
.thumb {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  cursor: zoom-in;
  display: block;
}
.thumb.square {
  width: 64px;
  height: 64px;
}
.thumb.circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
.thumb.poster {
  width: 84px;
  height: 112px;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  cursor: default;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker input {
  display: none;
}
</style>
