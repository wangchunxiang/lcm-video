<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';

interface FieldItem extends SettingField {
  value: string;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
}

/** 播放设置页自己的字段，改这个页面不会影响其他设置页 */
const BEHAVIOR: Row[] = [
  { key: 'player_autoplay', label: '自动播放', hint: '进入播放页自动开始' },
  { key: 'player_autonext', label: '自动连播', hint: '播完自动跳下一集' },
  { key: 'player_resume', label: '进度记忆', hint: '记住上次看到的位置' },
];

const CONTROLS: Row[] = [
  { key: 'player_screenshot', label: '截图', hint: '控制栏按钮' },
  { key: 'player_fullscreen', label: '全屏', hint: '控制栏按钮' },
  { key: 'player_webfullscreen', label: '网页全屏', hint: '控制栏按钮' },
  { key: 'player_setting', label: '设置面板', hint: '控制栏齿轮按钮' },
];

/** 设置面板内暂时没有可配项，播放器自带「信息 / 版本」 */
const PANEL: Row[] = [];

const ROWS = [...BEHAVIOR, ...CONTROLS, ...PANEL];
const KEYS = ROWS.map((row) => row.key);
const PANEL_KEYS = PANEL.map((row) => row.key);

const form = reactive<Record<string, string>>({
  player_autoplay: '0',
  player_autonext: '1',
  player_resume: '1',
  player_screenshot: '1',
  player_fullscreen: '1',
  player_webfullscreen: '0',
  player_setting: '1',
});

interface SourceItem {
  id: number;
  name: string;
  isEnabled: number;
}

const loading = ref(false);
const savingKey = ref('');

/** 去广告：选源 → 抽片 → 分析 → 人工确认，后端接口待接入，这里先跑演示流程 */
const sources = ref<SourceItem[]>([]);
const adsSourceId = ref<number | null>(null);

interface SampleVod {
  id: number;
  name: string;
  episode: string;
}

interface AdResult {
  key: string;
  kind: '中插' | '片尾' | '片头';
  total: string;
  pattern: string;
  vods: number;
  confirmed: boolean | null;
}

const sampleVods = ref<SampleVod[]>([]);
const logs = ref<string[]>([]);
const results = ref<AdResult[]>([]);
const analyzing = ref(false);
const logRef = ref<HTMLElement | null>(null);
const featureVisible = ref(false);
const activeResult = ref<AdResult | null>(null);

const adsSourceName = computed(
  () => sources.value.find((item) => item.id === adsSourceId.value)?.name ?? '',
);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pushLog(text: string) {
  const now = new Date();
  const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  logs.value.push(`[${clock}] ${text}`);
  void nextTick(() => {
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight;
  });
}

function openFeature(row: AdResult) {
  activeResult.value = row;
  featureVisible.value = true;
}

function confirmAd(row: AdResult, isAd: boolean) {
  row.confirmed = isAd;
  ElMessage.success(isAd ? '已标记为广告，播放时将跳过' : '已排除，播放时保留');
}

const VOD_POOL: SampleVod[] = [
  { id: 653, name: '大哥请赐教', episode: '第02集' },
  { id: 502, name: '流浪地球3', episode: '第01集' },
  { id: 61792, name: '凡人修仙传', episode: '第148集' },
  { id: 62233, name: '遮天', episode: '第96集' },
  { id: 494, name: '狂飙', episode: '第01集' },
  { id: 621, name: '长相思 第二季', episode: '第12集' },
  { id: 61803, name: '斗破苍穹年番', episode: '第102集' },
  { id: 62231, name: '庆余年 第二季', episode: '第30集' },
];

/** 从该源随机挑 5 部作品（后端接口未接入前先用固定池） */
function pickVods() {
  const pool = [...VOD_POOL];
  const picked: SampleVod[] = [];
  while (picked.length < 5 && pool.length) {
    picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  sampleVods.value = picked;
  results.value = [];
  logs.value = [];
}

async function startAnalyze() {
  if (!adsSourceId.value) {
    ElMessage.warning('请先选择采集源');
    return;
  }
  if (!sampleVods.value.length) {
    ElMessage.warning('请先随机选片');
    return;
  }
  analyzing.value = true;
  results.value = [];
  logs.value = [];

  pushLog(`选择采集源：${adsSourceName.value}`);
  await sleep(250);
  pushLog(`随机抽取 ${sampleVods.value.length} 部作品用于提取特征`);
  await sleep(300);

  for (const vod of sampleVods.value) {
    await sleep(160);
    pushLog(`${vod.name} ${vod.episode}：292 段 / 59 组`);
  }

  pushLog('组对齐滑窗：单集候选 486 个');
  await sleep(300);
  pushLog('跨作品匹配：同一时长序列在 ≥2 部作品出现');
  await sleep(300);
  pushLog('命中 2 条候选，写入特征表');
  await sleep(200);

  results.value = [
    {
      key: 'mid',
      kind: '中插',
      total: '20.0 秒',
      pattern: '4.0 / 5.0 / 4.0 / 4.24 / 2.76',
      vods: 3,
      confirmed: null,
    },
    {
      key: 'tail',
      kind: '片尾',
      total: '12.2 秒',
      pattern: '4.0 / 5.48 / 2.68',
      vods: 5,
      confirmed: null,
    },
  ];
  pushLog('分析完成，请确认哪些是广告');
  analyzing.value = false;
}

async function loadSources() {
  try {
    const data = await api.get<{ items: SourceItem[] }>('/sources', { page_size: 100 });
    sources.value = data.items;
  } catch {
    sources.value = [];
  }
}


const on = (key: string) => form[key] === '1';
const hasPanel = computed(() => on('player_setting'));
const panelItems = computed(() => [
  ...PANEL.filter((row) => on(row.key)).map((row) => row.label),
  '信息',
  '版本',
]);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: FieldItem[] }>('/settings');
    for (const item of data.items) {
      if (KEYS.includes(item.key)) form[item.key] = item.value ?? '';
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

/** 改动即存，不设保存按钮 */
async function saveKey(key: string) {
  savingKey.value = key;
  try {
    await api.put('/settings', { values: { [key]: String(form[key] ?? '') } });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
    await load();
  } finally {
    savingKey.value = '';
  }
}

onMounted(() => {
  void load();
  void loadSources();
});
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never" class="group-card">
      <div class="layout">
        <div class="left">
          <div class="stage-col">
          <div class="stage">
            <div class="poster">
              <el-icon :size="52"><VideoPlay /></el-icon>
            </div>

            <div v-if="hasPanel" class="panel">
              <div v-for="item in panelItems" :key="item" class="panel-item">
                <span>{{ item }}</span>
                <el-icon :size="12"><ArrowRight /></el-icon>
              </div>
            </div>

            <div class="bar">
              <el-icon :size="18"><VideoPlay /></el-icon>
              <div class="progress"><div class="progress-done" /></div>
              <span class="time">00:12 / 01:30</span>
              <el-icon :size="16"><Mute /></el-icon>
              <el-icon v-if="on('player_screenshot')" :size="16"><Camera /></el-icon>
              <el-icon v-if="on('player_fullscreen')" :size="16"><FullScreen /></el-icon>
              <el-icon v-if="on('player_webfullscreen')" :size="16"><Monitor /></el-icon>
              <el-icon v-if="hasPanel" :size="16" class="gear"><Setting /></el-icon>
            </div>

          </div>

        </div>

        <div class="list">
          <div
            v-for="row in ROWS"
            :key="row.key"
            class="row"
            :class="{ disabled: PANEL_KEYS.includes(row.key) && !hasPanel }"
          >
            <div class="row-name">{{ row.label }}</div>
            <div class="row-hint">
              {{ PANEL_KEYS.includes(row.key) && !hasPanel ? '需先开启「设置面板」' : row.hint }}
            </div>
            <el-switch
              v-model="form[row.key]"
              active-value="1"
              inactive-value="0"
              :loading="savingKey === row.key"
              :disabled="PANEL_KEYS.includes(row.key) && !hasPanel"
              @change="saveKey(row.key)"
            />
          </div>
        </div>
        </div>

        <aside class="right">
          <div class="ads-head">
            <div class="ads-title">去广告设置</div>
            <div class="ads-desc">
              随机抽取该源 5 部作品解析播放列表，把跨作品重复的片段判为广告；播放时自动跳过。
            </div>

            <div class="ads-toolbar">
              <el-select
                v-model="adsSourceId"
                placeholder="选择采集源"
                class="ads-select"
                :disabled="analyzing"
              >
                <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
              <el-button :disabled="analyzing" @click="pickVods">随机选片</el-button>
              <el-button type="primary" :loading="analyzing" @click="startAnalyze">开始分析</el-button>
            </div>
          </div>

          <div class="ads-sub">
            抽取作品
            <span v-if="sampleVods.length" class="ads-count">{{ sampleVods.length }}</span>
          </div>
          <el-table :data="sampleVods" border size="small" height="196" class="vod-table">
            <el-table-column prop="name" label="作品" min-width="140" show-overflow-tooltip />
            <el-table-column prop="episode" label="集数" width="88" align="center" />
            <template #empty>
              <span class="ads-empty">点击「随机选片」抽取 5 部作品</span>
            </template>
          </el-table>

          <div class="ads-sub">分析日志</div>
          <div ref="logRef" class="log-box">
            <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
            <div v-if="!logs.length" class="ads-empty">暂无日志</div>
          </div>

          <div class="ads-sub">
            候选广告
            <span v-if="results.length" class="ads-count">{{ results.length }}</span>
          </div>
          <div class="result-box">
            <div v-for="row in results" :key="row.key" class="result-row">
              <div class="result-top">
                <el-tag size="small" :type="row.kind === '片尾' ? 'warning' : 'primary'">{{ row.kind }}</el-tag>
                <span class="result-total">{{ row.total }}</span>
                <span class="result-vods">命中 {{ row.vods }} 部</span>
                <el-link type="primary" :underline="false" @click="openFeature(row)">查看</el-link>
                <span class="result-actions">
                  <el-button
                    link
                    :type="row.confirmed === true ? 'success' : 'info'"
                    @click="confirmAd(row, true)"
                  >
                    是广告
                  </el-button>
                  <el-button link type="danger" @click="confirmAd(row, false)">否</el-button>
                </span>
              </div>
              <div class="result-pattern">{{ row.pattern }}</div>
            </div>
            <div v-if="!results.length" class="ads-empty">分析后显示候选广告</div>
          </div>
        </aside>
      </div>
    </el-card>

    <el-dialog v-model="featureVisible" title="广告特征" width="640px">
      <el-descriptions v-if="activeResult" :column="2" border size="small">
        <el-descriptions-item label="类型">{{ activeResult.kind }}</el-descriptions-item>
        <el-descriptions-item label="总长">{{ activeResult.total }}</el-descriptions-item>
        <el-descriptions-item label="命中作品">{{ activeResult.vods }} 部</el-descriptions-item>
        <el-descriptions-item label="判定">{{ activeResult.confirmed === null ? '待确认' : activeResult.confirmed ? '已确认是广告' : '已排除' }}</el-descriptions-item>
        <el-descriptions-item label="时长序列" :span="2">{{ activeResult.pattern }}</el-descriptions-item>
      </el-descriptions>
      <div class="feature-hint">
        特征按采集源分别保存；同一片段在 ≥2 部不同作品出现才会被采纳。
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
}
.group-card {
  height: 100%;
}
.group-card :deep(.el-card__body) {
  height: 100%;
  box-sizing: border-box;
}
.layout {
  height: 100%;
  width: 100%;
  display: flex;
  gap: 24px;
}
.right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-left: 24px;
  border-left: 1px solid var(--el-border-color-lighter);
}
.ads-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.ads-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ads-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}
.ads-toolbar {
  display: flex;
  gap: 8px;
}
.ads-toolbar .el-button + .el-button {
  margin-left: 0;
}
.ads-select {
  flex: 1;
  min-width: 0;
}
.ads-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.ads-count {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.ads-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.vod-table {
  width: 100%;
}
.vod-table :deep(th.el-table__cell) {
  height: 36px;
  padding: 0;
}
.vod-table :deep(td.el-table__cell) {
  height: 32px;
  padding: 0;
}
.vod-table :deep(.el-table__cell) {
  vertical-align: middle;
}
.log-box {
  flex: none;
  height: 132px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-regular);
}
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.result-box {
  flex: 1;
  min-height: 72px;
  overflow-y: auto;
  padding-bottom: 4px;
}
.result-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.result-row:last-child {
  border-bottom: none;
}
.result-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.result-total {
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.result-vods {
  flex: 1;
  color: var(--el-text-color-secondary);
}
.result-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.result-pattern {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.feature-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.left {
  flex: 0 0 calc(50% - 12px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.stage-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.list {
  border-top: 1px solid var(--el-border-color-lighter);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.row.disabled .row-name,
.row.disabled .row-hint {
  color: var(--el-text-color-placeholder);
}
.row-name {
  flex: none;
  width: 84px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.row-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.stage {
  position: relative;
  padding-top: 56.25%;
  border-radius: 6px;
  overflow: hidden;
  background: #111;
}
.poster {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #1f2d3d, #3a4a5c 60%, #1f2d3d);
  color: rgba(255, 255, 255, 0.45);
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
}
.progress {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
}
.progress-done {
  width: 18%;
  height: 100%;
  border-radius: 2px;
  background: var(--el-color-primary);
}
.time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
}
.gear {
  color: var(--el-color-primary);
}
.mini-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.2);
}
.mini-progress-done {
  width: 18%;
  height: 100%;
  background: var(--el-color-primary);
}
.panel {
  position: absolute;
  right: 10px;
  bottom: 42px;
  min-width: 150px;
  padding: 4px 0;
  border-radius: 4px;
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  font-size: 12px;
}
.panel-empty {
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.6);
}
.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
}
.mini-window {
  position: absolute;
  right: 12px;
  bottom: 52px;
  width: 128px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.75);
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
}
</style>
