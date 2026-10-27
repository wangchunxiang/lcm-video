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

const props = withDefaults(
  defineProps<{
    group: 'base' | 'site' | 'playback';
    labelWidth?: string;
    size?: 'large' | 'default' | 'small';
  }>(),
  {
    labelWidth: '160px',
    size: 'default',
  },
);

const emit = defineEmits<{ (e: 'change', key: string, value: string): void }>();

const fields = ref<(SettingField & { value: string })[]>([]);
const lineOptions = ref<LineOption[]>([]);
const newLine = reactive<Record<string, string>>({});
const themes = ref<ThemeItem[]>([]);
const loading = ref(false);
const saving = ref(false);

const groupFields = computed(() => fields.value.filter((field) => field.group === props.group));

const sections = computed(() => {
  const result: { title: string; fields: (SettingField & { value: string })[] }[] = [];
  for (const field of groupFields.value) {
    const title = field.section ?? '';
    const last = result[result.length - 1];
    if (last && last.title === title) last.fields.push(field);
    else result.push({ title, fields: [field] });
  }
  return result;
});

function isImage(field: SettingField): boolean {
  return field.key === 'site_logo' || field.key === 'site_favicon';
}

function isBlock(field: SettingField): boolean {
  return field.type === 'order';
}

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
    for (const field of data.items) emit('change', field.key, field.value);
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
  <div v-loading="loading" class="page">
    <el-card shadow="never" class="group-card">
      <div
        v-for="(section, index) in sections"
        :key="index"
        class="section"
        :class="{ 'is-first': index === 0 }"
      >
        <div
          v-for="field in section.fields"
          :key="field.key"
          class="row"
          :class="{ 'row-block': isBlock(field) }"
        >
          <div class="row-main">
            <div class="row-title">{{ field.label }}</div>
            <div v-if="field.hint && field.type !== 'order' && !isImage(field)" class="row-desc">
              {{ field.hint }}
            </div>
          </div>
          <div class="row-ctrl">
            <ImageUpload v-if="isImage(field)" v-model="field.value" />
            <div v-else-if="field.type === 'order'" class="order-field">
              <div v-if="orderItems(field).length > 0" class="order-list">
                <div
                  v-for="(item, orderIndex) in orderItems(field)"
                  :key="item"
                  class="order-row"
                  :class="{ 'is-dragging': dragFieldKey === field.key && dragIndex === orderIndex }"
                  draggable="true"
                  @dragstart="startDrag(field, orderIndex)"
                  @dragover.prevent="dragOver(field, orderIndex)"
                  @dragend="endDrag"
                >
                  <span class="order-index">{{ orderIndex + 1 }}</span>
                  <span class="order-label">{{ labelOf(item) }}</span>
                  <span class="order-code">{{ item }}</span>
                  <el-button class="order-remove" link type="danger" @click="removeOrder(field, orderIndex)">
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
            <el-select
              v-else-if="field.type === 'select'"
              v-model="field.value"
              class="field"
              @change="emit('change', field.key, field.value)"
            >
              <el-option
                v-for="option in optionsOf(field)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-switch
              v-else-if="field.type === 'switch'"
              v-model="field.value"
              active-value="1"
              inactive-value="0"
              @change="emit('change', field.key, field.value)"
            />
            <el-input
              v-else-if="field.type === 'textarea'"
              v-model="field.value"
              type="textarea"
              :rows="3"
              class="field"
              @input="emit('change', field.key, field.value)"
            />
            <el-input v-else v-model="field.value" class="field" @input="emit('change', field.key, field.value)" />
          </div>
        </div>
      </div>

      <div class="card-foot">
        <el-button @click="load">重置</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}
.group-card :deep(.el-card__body) {
  padding: 4px 20px 0;
}
.section + .section {
  margin-top: 14px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 10px 0;
}
.row-main {
  flex: 0 0 150px;
  padding-top: 6px;
  min-width: 0;
}
.row-title {
  line-height: 1.4;
  color: var(--el-text-color-regular);
}
.row-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}
.row-ctrl {
  flex: 1;
  min-width: 0;
  max-width: 560px;
}
.row-block {
  flex-direction: column;
  gap: 8px;
}
.row-block .row-main {
  flex: none;
  padding-top: 0;
}
.field {
  width: 100%;
  max-width: 360px;
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
.card-foot {
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  margin-top: 8px;
  padding: 14px 0 16px 166px;
  border-top: 1px solid var(--el-border-color);
}
</style>
