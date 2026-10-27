<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.ts';

interface VodDetail {
  id: number;
  name: string;
  subName: string;
  categoryId: number;
  categoryPid: number;
  categoryName: string | null;
  parentName: string | null;
  year: number;
  area: string;
  lang: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string;
  remarks: string;
  releaseDate: string;
  cover: string;
  letter: string;
  episodeCount: number;
  status: number;
  collectedAt: string;
  createdAt: string;
}

interface Episode {
  name: string;
  url: string;
}

interface PlayLine {
  id: number;
  sourceId: number;
  sourceName: string | null;
  sourceFrom: string;
  sourceVodId: string;
  sourceUpdatedAt: string | null;
  episodes: Episode[];
  dirty?: boolean;
  saving?: boolean;
}

interface CategoryNode {
  id: number;
  pid: number;
  name: string;
  children?: CategoryNode[];
}

const props = defineProps<{ modelValue: boolean; vodId: number }>();
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
  sub_name: '',
  category_id: 0,
  year: 0,
  area: '',
  lang: '',
  actor: '',
  director: '',
  writer: '',
  intro: '',
  content: '',
  remarks: '',
  release_date: '',
  cover: '',
  letter: '',
  episode_count: 0,
  status: 1,
  categoryName: '',
  collectedAt: '',
});

const lines = ref<PlayLine[]>([]);
const collectedDate = computed(() => (form.collectedAt || '').slice(0, 10) || '—')
const collectedTime = computed(() => (form.collectedAt || '').slice(11, 19))
const totalEpisodes = computed(() => Math.max(0, ...lines.value.map((line) => line.episodes.length)));
const categories = ref<CategoryNode[]>([]);

const activeLineId = ref<number | null>(null);
const activeLine = computed(() => lines.value.find((line) => line.id === activeLineId.value) ?? null);

const pasteVisible = ref(false);
const pasteTarget = ref<PlayLine | null>(null);
const pasteText = ref('');


async function load() {
  if (!props.vodId) return;
  loading.value = true;
  try {
    const [detail, categoryData] = await Promise.all([
      api.get<{ vod: VodDetail }>(`/vods/${props.vodId}`),
      api.get<{ items: CategoryNode[] }>('/categories'),
    ]);
    categories.value = categoryData.items;

    const row = detail.vod;
    Object.assign(form, {
      name: row.name,
      sub_name: row.subName,
      category_id: row.categoryId,
      year: row.year,
      area: row.area,
      lang: row.lang,
      actor: row.actor,
      director: row.director,
      writer: row.writer,
      intro: row.intro,
      content: row.content ?? '',
      remarks: row.remarks,
      release_date: row.releaseDate,
      cover: row.cover,
      letter: row.letter,
      episode_count: row.episodeCount,
      status: row.status,
      categoryName: [row.parentName, row.categoryName].filter(Boolean).join(' / '),
      collectedAt: row.collectedAt,
    });

    const plays = await api.get<{ items: PlayLine[] }>(`/vods/${props.vodId}/plays`);
    lines.value = plays.items.map((line) => ({ ...line, episodes: [...line.episodes] }));
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
  saving.value = true;
  try {
    await api.put(`/vods/${props.vodId}`, {
      name: form.name,
      sub_name: form.sub_name,
      category_id: form.category_id,
      year: Number(form.year) || 0,
      area: form.area,
      lang: form.lang,
      actor: form.actor,
      director: form.director,
      writer: form.writer,
      intro: form.intro,
      content: form.content,
      remarks: form.remarks,
      release_date: form.release_date,
      cover: form.cover,
      letter: form.letter,
      episode_count: Number(form.episode_count) || 0,
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
    await api.put(`/plays/${line.id}`, { play_url: episodesToUrl(line.episodes) });
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
    await ElMessageBox.confirm(`确定删除线路「${line.sourceName || line.sourceFrom}」吗？`, '删除线路', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/plays/${line.id}`);
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

function lineTitle(line: PlayLine): string {
  if (line.sourceId === 0) return line.sourceFrom;
  return `${line.sourceName || '源站'} · ${line.sourceFrom}`;
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

              <ul class="side-info">
                <li><span>ID</span><b>{{ vodId }}</b></li>
                <li><span>线路</span><b>{{ lines.length }} 条</b></li>
                <li><span>剧集</span><b>{{ totalEpisodes }} 集</b></li>
                <li class="stack">
                  <span>最后采集</span>
                  <b>{{ collectedDate }}</b>
                  <b class="dim">{{ collectedTime }}</b>
                </li>
              </ul>
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
                      <el-input v-model="form.sub_name" maxlength="255" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="6">
                    <el-form-item label="分类">
                      <el-tree-select
                        v-model="form.category_id"
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
                  <el-col :span="6">
                    <el-form-item label="年份">
                      <el-input v-model="form.year" maxlength="4" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="地区">
                      <el-input v-model="form.area" maxlength="50" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="语言">
                      <el-input v-model="form.lang" maxlength="50" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="6">
                    <el-form-item label="首字母">
                      <el-input v-model="form.letter" maxlength="1" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="上映日期">
                      <el-input v-model="form.release_date" maxlength="20" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="总集数">
                      <el-input v-model="form.episode_count" maxlength="6" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="备注">
                      <el-input v-model="form.remarks" maxlength="100" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-form-item label="封面地址">
                      <el-input v-model="form.cover" placeholder="https://…" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-form-item label="演员">
                      <el-input v-model="form.actor" maxlength="500" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="导演">
                      <el-input v-model="form.director" maxlength="255" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="编剧">
                      <el-input v-model="form.writer" maxlength="255" />
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-form-item label="简介">
                      <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="500" show-word-limit />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="详细介绍">
                      <el-input v-model="form.content" type="textarea" :rows="4" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="状态">
                      <el-radio-group v-model="form.status">
                        <el-radio :value="1">上架</el-radio>
                        <el-radio :value="0">下架</el-radio>
                      </el-radio-group>
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
          </div>

          <el-empty v-if="lines.length === 0" description="这部影片还没有线路" />

          <template v-else-if="activeLine">
            <div class="line-head">
              <div>
                <span class="muted first">共 {{ activeLine.episodes.length }} 集</span>
                <span v-if="activeLine.sourceUpdatedAt" class="muted">源站更新：{{ activeLine.sourceUpdatedAt }}</span>
              </div>
              <div>
                <el-button size="small" @click="openPaste(activeLine)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeLine(activeLine)">删除线路</el-button>
              </div>
            </div>

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
  width: 132px;
  flex: none;
}
.poster {
  width: 130px;
  height: 180px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  cursor: zoom-in;
}
.side-info {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.9;
  color: var(--el-text-color-secondary);
}
.side-info li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.side-info b {
  font-weight: 400;
  color: var(--el-text-color-primary);
}
.side-info li.stack {
  display: block;
  margin-top: 4px;
}
.side-info li.stack .dim {
  display: block;
  color: var(--el-text-color-secondary);
}
.poster-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  cursor: default;
}
.base-main {
  flex: 1;
  min-width: 0;
}
.group-gap {
  height: 4px;
}
.line-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.option-meta {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.line {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.line-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.muted.first {
  margin-left: 0;
}
.muted {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
code {
  padding: 0 3px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
}
</style>
