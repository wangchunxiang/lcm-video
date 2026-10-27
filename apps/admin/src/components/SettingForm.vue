<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../api/client.ts';
import ImageUpload from './ImageUpload.vue';

interface ThemeItem {
  name: string;
  title: string;
  active: boolean;
}

interface LineOption {
  value: string;
  label: string;
  total: number;
}

const props = defineProps<{ group: 'base' | 'site' }>();

const fields = ref<(SettingField & { value: string })[]>([]);
const lineOptions = ref<LineOption[]>([]);
const newLine = reactive<Record<string, string>>({});
const themes = ref<ThemeItem[]>([]);
const loading = ref(false);
const saving = ref(false);

const groupFields = computed(() => fields.value.filter((field) => field.group === props.group));

function optionsOf(field: SettingField) {
  if (field.key === 'site_theme') {
    return themes.value.map((theme) => ({ label: theme.title, value: theme.name }));
  }
  return field.options ?? [];
}

function orderItems(field: SettingField & { value: string }): string[] {
  return (field.value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function setOrder(field: SettingField & { value: string }, items: string[]) {
  field.value = items.join(',');
}

const dragFieldKey = ref('');
const dragIndex = ref(-1);

function startDrag(field: SettingField & { value: string }, index: number) {
  dragFieldKey.value = field.key;
  dragIndex.value = index;
}

function dragOver(field: SettingField & { value: string }, index: number) {
  if (dragFieldKey.value !== field.key || dragIndex.value < 0 || dragIndex.value === index) return;
  const items = orderItems(field);
  const [moved] = items.splice(dragIndex.value, 1);
  if (!moved) return;
  items.splice(index, 0, moved);
  setOrder(field, items);
  dragIndex.value = index;
}

function endDrag() {
  dragFieldKey.value = '';
  dragIndex.value = -1;
}

function clearOrder(field: SettingField & { value: string }) {
  setOrder(field, []);
}

function removeOrder(field: SettingField & { value: string }, index: number) {
  const items = orderItems(field);
  items.splice(index, 1);
  setOrder(field, items);
}

function addOrder(field: SettingField & { value: string }) {
  const value = (newLine[field.key] ?? '').trim();
  if (!value) return;
  const items = orderItems(field);
  if (items.includes(value)) {
    ElMessage.warning('该线路已在列表中');
    return;
  }
  items.push(value);
  setOrder(field, items);
  newLine[field.key] = '';
}

function labelOf(sourceFrom: string): string {
  const hit = lineOptions.value.find((item) => item.value === sourceFrom);
  return hit ? hit.label : sourceFrom;
}

function availableLineOptions(field: SettingField & { value: string }): LineOption[] {
  const used = orderItems(field);
  return lineOptions.value.filter((item) => !used.includes(item.value));
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: (SettingField & { value: string })[]; themes: ThemeItem[] }>('/settings');
    fields.value = data.items;
    themes.value = data.themes;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const values: Record<string, string> = {};
  for (const field of groupFields.value) values[field.key] = field.value ?? '';

  saving.value = true;
  try {
    await api.put('/settings', { values });
    ElMessage.success('保存成功');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function loadLineOptions() {
  try {
    const data = await api.get<{ items: LineOption[] }>('/settings/line-options');
    lineOptions.value = data.items;
  } catch {
    lineOptions.value = [];
  }
}

onMounted(async () => {
  await Promise.all([load(), loadLineOptions()]);
});
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <el-form label-width="160px" class="setting-form">
      <el-form-item v-for="field in groupFields" :key="field.key" :label="field.label">
        <ImageUpload
          v-if="field.key === 'site_logo' || field.key === 'site_favicon'"
          v-model="field.value"
          :tip="field.hint"
        />
        <div v-else-if="field.type === 'order'" class="order-field">
          <div v-if="orderItems(field).length > 0" class="order-list">
            <div
              v-for="(item, index) in orderItems(field)"
              :key="item"
              class="order-row"
              :class="{ 'is-dragging': dragFieldKey === field.key && dragIndex === index }"
              draggable="true"
              @dragstart="startDrag(field, index)"
              @dragover.prevent="dragOver(field, index)"
              @dragend="endDrag"
            >
              <span class="order-index">{{ index + 1 }}</span>
              <span class="order-label">{{ labelOf(item) }}</span>
              <span class="order-code">{{ item }}</span>
              <el-button class="order-remove" link type="danger" @click="removeOrder(field, index)">
                移除
              </el-button>
            </div>
          </div>
          <div v-else class="order-empty">还没有配置，播放页按线路入库先后排列</div>
          <div class="order-add">
            <el-select
              v-model="newLine[field.key]"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入线路标识"
              style="width: 320px"
            >
              <el-option
                v-for="option in availableLineOptions(field)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-button @click="addOrder(field)">添加</el-button>
            <el-button v-if="orderItems(field).length > 0" @click="clearOrder(field)">清空</el-button>
          </div>
        </div>
        <el-select v-else-if="field.type === 'select'" v-model="field.value" class="field">
          <el-option v-for="option in optionsOf(field)" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-switch
          v-else-if="field.type === 'switch'"
          v-model="field.value"
          active-value="1"
          inactive-value="0"
        />
        <el-input
          v-else-if="field.type === 'textarea'"
          v-model="field.value"
          type="textarea"
          :rows="3"
          class="field"
        />
        <el-input v-else v-model="field.value" class="field" />
        <div v-if="field.hint && field.key !== 'site_logo' && field.key !== 'site_favicon'" class="hint">
          {{ field.hint }}
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button @click="load">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<style scoped>
.setting-form {
  max-width: 720px;
}
.field {
  width: 100%;
}
.order-field {
  width: 100%;
}
.order-empty {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 4px 0 12px;
}
.order-list {
  max-height: 288px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.order-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  cursor: move;
  background: var(--el-bg-color);
}
.order-row + .order-row {
  border-top: 1px solid var(--el-border-color-lighter);
}
.order-row:hover {
  background: var(--el-fill-color-light);
}
.order-row.is-dragging {
  opacity: 0.5;
}
.order-remove {
  margin-left: auto;
}
.order-index {
  width: 18px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.order-label {
  flex: none;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-code {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.order-add {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
