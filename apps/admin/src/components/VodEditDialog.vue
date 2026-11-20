<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.ts';
import { formatDateTime } from '../utils/datetime.ts';

interface VodDetail {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
  subName: string;
  categoryId: string;
  categoryPid: string;
  categoryName: string;
  parentName: string;
  year: number;
  area: string;
  lang: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string | null;
  remarks: string;
  releaseDate: string;
  cover: string;
  episodeCount: number;
  status: number;
  collectedAt: string;
  createdAt: string;
  plays: number;
  episodes: number;
}

interface Episode {
  name: string;
  url: string;
}

interface PlayLine {
  id: string;
  sourceId: string;
  /** 线路显示名（线路注册表的 name），可能为空 */
  lineName: string;
  /** 源站名（采集源的 name），手工线路为空 */
  sourceName: string;
  sourceFrom: string;
  sourceUpdatedAt: string | null;
  episodes: Episode[];
  dirty?: boolean;
  saving?: boolean;
}

interface CategoryNode {
  id: string;
  pid: string;
  name: string;
  children?: CategoryNode[];
}

const props = defineProps<{ modelValue: boolean; vodId: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'saved'): void }>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const activeTab = ref('base');
const loading = ref(false);
const saving = ref(false);
const form = reactive({
  name: '',
  subName: '',
  categoryId: '' as string | null,
  year: 0,
  area: '',
  lang: '',
  actor: '',
  director: '',
  writer: '',
  intro: '',
  content: '',
  remarks: '',
  releaseDate: '',
  cover: '',
  episodeCount: 0,
  status: 1,
  categoryName: '',
  collectedAt: '',
  createdAt: '',
});

const lines = ref<PlayLine[]>([]);
const totalEpisodes = computed(() => Math.max(0, ...lines.value.map((line) => line.episodes.length)));
const categories = ref<CategoryNode[]>([]);

const activeLineId = ref<string | null>(null);
const activeLine = computed(() => lines.value.find((line) => line.id === activeLineId.value) ?? null);

const pasteVisible = ref(false);
const pasteTarget = ref<PlayLine | null>(null);
const pasteText = ref('');

async function load() {
  if (!props.vodId) return;
  loading.value = true;
  try {
    const [detail, categoryData] = await Promise.all([
      api.get<VodDetail>(`/vod/${props.vodId}`),
      api.post<CategoryNode[]>('/category/tree'),
    ]);
    categories.value = categoryData;

    Object.assign(form, {
      name: detail.name,
      subName: detail.subName,
      categoryId: detail.categoryId,
      year: detail.year,
      area: detail.area,
      lang: detail.lang,
      actor: detail.actor,
      director: detail.director,
      writer: detail.writer,
      intro: detail.intro,
      content: detail.content ?? '',
      remarks: detail.remarks,
      releaseDate: detail.releaseDate,
      cover: detail.cover,
      episodeCount: detail.episodeCount,
      status: detail.status,
      categoryName: [detail.parentName, detail.categoryName].filter(Boolean).join(' / '),
      collectedAt: detail.collectedAt,
      createdAt: detail.createdAt ?? '',
    });

    const plays = await api.post<PlayLine[]>('/vod-play/by-vod', { vodId: props.vodId });
    lines.value = plays.map((line) => ({ ...line, episodes: [...line.episodes] }));
    if (!lines.value.some((line) => line.id === activeLineId.value)) {
      activeLineId.value = lines.value[0]?.id ?? null;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载影片失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      activeTab.value = 'base';
      void load();
    }
  },
);

function close() {
  visible.value = false;
  emit('saved');
}

function onSave() {
  if (activeTab.value === 'base') {
    void saveBase();
    return;
  }
  if (activeLine.value) void saveLine(activeLine.value);
}

async function saveBase() {
  if (!form.categoryId) {
    ElMessage.warning('请选择分类');
    return;
  }
  saving.value = true;
  try {
    await api.put(`/vod/${props.vodId}`, {
      categoryId: form.categoryId,
      name: form.name,
      subName: form.subName,
      year: Number(form.year) || 0,
      area: form.area,
      lang: form.lang,
      actor: form.actor,
      director: form.director,
      writer: form.writer,
      intro: form.intro,
      content: form.content,
      remarks: form.remarks,
      releaseDate: form.releaseDate,
      cover: form.cover,
      episodeCount: Number(form.episodeCount) || 0,
      status: form.status,
    });
    ElMessage.success('已保存');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

function episodesToUrl(episodes: Episode[]): string {
  return episodes
    .filter((item) => item.url.trim() !== '')
    .map((item) => `${item.name.trim()}$${item.url.trim()}`)
    .join('#');
}

async function saveLine(line: PlayLine, message = '线路已保存') {
  line.saving = true;
  try {
    await api.put(`/vod-play/${line.id}`, { playUrl: episodesToUrl(line.episodes) });
    ElMessage.success(message);
    line.dirty = false;
    const keepId = activeLineId.value;
    await load();
    activeLineId.value = keepId;
    activeTab.value = 'lines';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存线路失败');
  } finally {
    line.saving = false;
  }
}

async function removeLine(line: PlayLine) {
  try {
    await ElMessageBox.confirm(`确定删除线路「${lineTitle(line)}」吗？`, '删除线路', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/vod-play/${line.id}`);
    ElMessage.success('已删除线路');
    await load();
    activeTab.value = 'lines';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

function removeEpisode(line: PlayLine, index: number) {
  line.episodes.splice(index, 1);
  line.dirty = true;
}

/* ------------------------------ 整段粘贴导入 ------------------------------ */

function openPaste(line: PlayLine) {
  pasteTarget.value = line;
  pasteText.value = line.episodes
    .filter((item) => item.name.trim() !== '' || item.url.trim() !== '')
    .map((item) => `${item.name.trim()}$${item.url.trim()}`)
    .join('\n');
  pasteVisible.value = true;
}

function applyPaste() {
  const line = pasteTarget.value;
  if (!line) return;
  const text = pasteText.value.trim();
  if (!text) {
    ElMessage.warning('请先粘贴内容');
    return;
  }

  const parts = text.includes('#') && !text.includes('\n') ? text.split('#') : text.split(/\r?\n/);
  const episodes: Episode[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const dollar = part.indexOf('$');
    if (dollar >= 0) {
      episodes.push({ name: part.slice(0, dollar).trim(), url: part.slice(dollar + 1).trim() });
      continue;
    }
    const space = part.search(/\s/);
    if (space > 0 && /^https?:\/\//i.test(part.slice(space).trim())) {
      episodes.push({ name: part.slice(0, space).trim(), url: part.slice(space).trim() });
      continue;
    }
    episodes.push({ name: `第${String(episodes.length + 1).padStart(2, '0')}集`, url: part });
  }

  if (episodes.length === 0) {
    ElMessage.warning('没有解析到剧集');
    return;
  }
  line.episodes = episodes;
  line.dirty = true;
  pasteVisible.value = false;
  void saveLine(line);
}

/** 下拉里的线路标题：线路名 → 源站名 → 线路标识。 */
function lineTitle(line: PlayLine): string {
  return line.lineName || line.sourceName || line.sourceFrom;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`编辑影片${form.name ? '：' + form.name : ''}`"
    width="1000px"
    top="5vh"
    class="vod-edit-dialog"
    destroy-on-close
    @closed="emit('saved')"
  >
    <div v-loading="loading">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="base">
          <div class="base">
            <div class="base-side">
              <el-image
                v-if="form.cover"
                :src="form.cover"
                fit="cover"
                class="poster"
                :preview-src-list="[form.cover]"
                preview-teleported
                hide-on-click-modal
              />
              <div v-else class="poster poster-empty">无封面</div>

              <div class="metrics">
                <div class="metric-row"><span>ID</span><b>{{ vodId }}</b></div>
                <div class="metric-row"><span>线路</span><b>{{ lines.length }} 条</b></div>
                <div class="metric-row"><span>剧集</span><b>{{ totalEpisodes }} 集</b></div>
                <div class="metric-row">
                  <span>入库</span>
                  <b class="metric-time">{{ formatDateTime(form.createdAt) || '—' }}</b>
                </div>
                <div class="metric-row">
                  <span>采集</span>
                  <b class="metric-time">{{ formatDateTime(form.collectedAt) || '—' }}</b>
                </div>
              </div>
            </div>

            <div class="base-main">
              <el-form label-width="76px">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="标题">
                      <el-input v-model="form.name" maxlength="255" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="副标题">
                      <el-input v-model="form.subName" maxlength="500" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="分类">
                      <el-tree-select
                        v-model="form.categoryId"
                        :data="categories"
                        :props="{ label: 'name', children: 'children' }"
                        node-key="id"
                        check-strictly
                        :render-after-expand="false"
                        default-expand-all
                        filterable
                        style="width: 100%"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="年份">
                      <el-input-number v-model="form.year" :min="0" :max="2100" :controls="false" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="地区">
                      <el-input v-model="form.area" maxlength="100" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="语言">
                      <el-input v-model="form.lang" maxlength="100" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="上映日期">
                      <el-input v-model="form.releaseDate" maxlength="20" placeholder="2024-05-01" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="总集数">
                      <el-input-number v-model="form.episodeCount" :min="0" :max="9999" :controls="false" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="备注">
                      <el-input v-model="form.remarks" maxlength="255" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-form-item label="封面地址">
                      <el-input v-model="form.cover" placeholder="https://…" maxlength="1000" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="12">
                    <el-form-item label="导演">
                      <el-input v-model="form.director" maxlength="500" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="编剧">
                      <el-input v-model="form.writer" maxlength="500" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="演员">
                      <el-input v-model="form.actor" maxlength="1000" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-form-item label="简介">
                      <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="1000" show-word-limit />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="详细介绍">
                      <el-input v-model="form.content" type="textarea" :rows="4" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="状态">
                      <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`线路与剧集（${lines.length}）`" name="lines">
          <div class="line-toolbar">
            <el-select v-model="activeLineId" placeholder="选择线路" style="width: 320px">
              <el-option v-for="line in lines" :key="line.id" :label="lineTitle(line)" :value="line.id">
                <span>{{ lineTitle(line) }}</span>
                <span class="option-meta">{{ line.episodes.length }} 集</span>
              </el-option>
            </el-select>
            <template v-if="activeLine">
              <el-button @click="openPaste(activeLine)">编辑</el-button>
              <el-button type="danger" plain @click="removeLine(activeLine)">删除线路</el-button>
            </template>
          </div>

          <el-empty v-if="lines.length === 0" description="这部影片还没有线路" />

          <template v-else-if="activeLine">
            <el-table :data="activeLine.episodes" border size="small" max-height="320">
              <el-table-column label="#" width="60" align="center">
                <template #default="{ $index }">{{ $index + 1 }}</template>
              </el-table-column>
              <el-table-column label="名称" width="160">
                <template #default="{ row, $index }">
                  <el-input
                    v-model="row.name"
                    size="small"
                    @input="activeLine && (activeLine.dirty = true)"
                    :placeholder="`第${$index + 1}集`"
                  />
                </template>
              </el-table-column>
              <el-table-column label="地址">
                <template #default="{ row }">
                  <el-input v-model="row.url" size="small" @input="activeLine && (activeLine.dirty = true)" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="center">
                <template #default="{ $index }">
                  <el-button link size="small" type="danger" @click="removeEpisode(activeLine!, $index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-tab-pane>

      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button type="primary" :loading="saving || Boolean(activeLine && activeLine.saving)" @click="onSave">
        保存
      </el-button>
    </template>

    <el-dialog v-model="pasteVisible" title="编辑剧集" width="620px" append-to-body>
      <p class="muted">
        每行一集，支持三种写法：<code>第01集$https://…</code>、<code>第01集 https://…</code>、<code>https://…</code>（只有地址时自动补「第 N 集」）。
        也可以直接粘贴用 <code>#</code> 分隔的一整串。保存后会覆盖当前线路的剧集列表。
      </p>
      <el-input v-model="pasteText" type="textarea" :rows="12" placeholder="第01集$https://example.com/1.m3u8" />
      <template #footer>
        <el-button @click="pasteVisible = false">取消</el-button>
        <el-button type="primary" @click="applyPaste">保存</el-button>
      </template>
    </el-dialog>

  </el-dialog>
</template>

<style scoped>
:deep(.el-dialog) {
  max-width: 94%;
}
:deep(.el-dialog__body) {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding-top: 8px;
}
.base {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.base-side {
  /* 220px：左栏要放得下 `2026-11-20 12:00:00` 这种完整时间，150px 时会被折成两行 */
  width: 220px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.poster {
  width: 100%;
  height: 300px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  cursor: zoom-in;
}
.metrics {
  width: 100%;
  margin-top: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.metric-row {
  display: flex;
  justify-content: space-between;
  padding: 7px 10px;
  color: var(--el-text-color-secondary);
}
.metric-row + .metric-row {
  border-top: 1px solid var(--el-border-color-lighter);
}
.metric-row b {
  flex: none;
  font-weight: 400;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.base-main {
  flex: 1;
  min-width: 0;
}
/* el-input-number 默认把输入值居中，这里跟同表单的 el-input 对齐成左对齐 */
.base-main :deep(.el-input-number .el-input__inner) {
  text-align: left;
}
.line-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.line-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
.option-meta {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
code {
  padding: 0 3px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
}
</style>
