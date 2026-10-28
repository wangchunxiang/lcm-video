<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import Hls from 'hls.js';
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

interface AdFeature {
  id: number;
  kind: number;
  durations: string;
  totalMs: number;
  hitVods: number;
  status: number;
  sample: Array<{
    vod_id: number;
    vod_name: string;
    start: number;
    start_sec?: number;
    url?: string;
  }> | null;
}

/** 候选只存在内存里，只有人工确认的才落库 */
interface Candidate extends Omit<AdFeature, 'id' | 'status'> {
  key: string;
}

const sampleVods = ref<SampleVod[]>([]);
const logs = ref<string[]>([]);
const confirmed = ref<AdFeature[]>([]);
const candidates = ref<Candidate[]>([]);
const analyzing = ref(false);
const logVisible = ref(false);
const confirmedFeatures = computed(() => confirmed.value);
const candidateFeatures = computed(() => candidates.value);
const picking = ref(false);
const logRef = ref<HTMLElement | null>(null);
const featureVisible = ref(false);
const confirmedWrapRef = ref<HTMLElement | null>(null);
const confirmedHeight = ref(196);
let confirmedObserver: ResizeObserver | null = null;

function observeConfirmed() {
  const el = confirmedWrapRef.value;
  if (!el) return;
  confirmedObserver?.disconnect();
  confirmedObserver = new ResizeObserver(() => {
    confirmedHeight.value = Math.max(132, el.clientHeight);
  });
  confirmedObserver.observe(el);
  confirmedHeight.value = Math.max(132, el.clientHeight);
}
const activeResult = ref<AdFeature | null>(null);
const activeCandidate = ref<Candidate | null>(null);

const adsSourceName = computed(
  () => sources.value.find((item) => item.id === adsSourceId.value)?.name ?? '',
);

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

const videoRef = ref<HTMLVideoElement | null>(null);
const sampleIndex = ref(0);
const playerUrl = ref('');
let hls: Hls | null = null;

function destroyPlayer() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  const video = videoRef.value;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  playerUrl.value = '';
}

async function loadSample(index: number) {
  const item = activeResult.value?.sample?.[index];
  if (!item?.url) {
    ElMessage.warning('这条样例没有播放地址，重新分析一次即可带上');
    return;
  }
  sampleIndex.value = index;
  destroyPlayer();
  await nextTick();
  const video = videoRef.value;
  if (!video) return;
  playerUrl.value = item.url;
  const startAt = Math.max(0, (item.start_sec ?? 0) - 1);
  if (item.url.includes('.m3u8') && Hls.isSupported()) {
    const instance = new Hls({ startPosition: startAt });
    instance.loadSource(item.url);
    instance.attachMedia(video);
    hls = instance;
  } else {
    video.src = item.url;
    video.addEventListener(
      'loadedmetadata',
      () => {
        video.currentTime = startAt;
      },
      { once: true },
    );
  }
  video.play().catch(() => undefined);
}

function openFeature(row: AdFeature | Candidate) {
  activeResult.value = row as AdFeature;
  activeCandidate.value = 'key' in row ? (row as Candidate) : null;
  featureVisible.value = true;
  sampleIndex.value = 0;
  destroyPlayer();
  void nextTick(() => {
    if (activeResult.value?.sample?.length) void loadSample(0);
  });
}

function closeFeature() {
  destroyPlayer();
  activeCandidate.value = null;
}

/** 查看弹窗里直接判定：确认后落库，否则只从候选里移除 */
async function judge(isAd: boolean) {
  const candidate = activeCandidate.value;
  featureVisible.value = false;
  if (isAd) {
    if (candidate) await confirmAd(candidate);
    return;
  }
  if (candidate) dismissAd(candidate);
  else if (activeResult.value) await removeFeature(activeResult.value);
}

onUnmounted(destroyPlayer);

function kindText(kind: number) {
  return kind === 1 ? '片头' : kind === 3 ? '片尾' : '中插';
}

function secondsText(ms: number) {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

async function confirmAd(row: Candidate) {
  if (!adsSourceId.value) return;
  try {
    await api.post(`/sources/${adsSourceId.value}/ads`, {
      durations: row.durations,
      kind: row.kind,
      totalMs: row.totalMs,
      hitVods: row.hitVods,
      sample: row.sample,
    });
    candidates.value = candidates.value.filter((item) => item.key !== row.key);
    await loadFeatures();
    ElMessage.success('已确认是广告，播放时将跳过');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

function dismissAd(row: Candidate) {
  candidates.value = candidates.value.filter((item) => item.key !== row.key);
  ElMessage.success('已排除，播放时保留');
}

async function removeFeature(row: AdFeature) {
  if (!adsSourceId.value) return;
  try {
    await api.del(`/sources/${adsSourceId.value}/ads/${row.id}`);
    await loadFeatures();
    ElMessage.success('已撤销');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤销失败');
  }
}

/** 换源后之前的抽取与分析结果都作废，并拉该源已有特征 */
watch(adsSourceId, () => {
  sampleVods.value = [];
  candidates.value = [];
  logs.value = [];
  void loadFeatures();
});

async function loadFeatures() {
  if (!adsSourceId.value) return;
  try {
    const data = await api.get<AdFeature[]>(`/sources/${adsSourceId.value}/ads`);
    confirmed.value = data;
  } catch {
    confirmed.value = [];
  }
}

/** 从该源随机抽 5 部作品 */
async function pickVods() {
  if (!adsSourceId.value) {
    ElMessage.warning('请先选择采集源');
    return;
  }
  picking.value = true;
  try {
    const data = await api.post<{ items: SampleVod[] }>(`/sources/${adsSourceId.value}/ads/pick`);
    sampleVods.value = data.items;
    candidates.value = [];
    logs.value = [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '抽取失败');
  } finally {
    picking.value = false;
  }
}

interface StreamMessage {
  type: 'log' | 'result' | 'error';
  text?: string;
  message?: string;
  features?: Array<Omit<AdFeature, 'id' | 'status'>>;
  sampled?: number;
}

function handleStreamMessage(raw: string) {
  let msg: StreamMessage;
  try {
    msg = JSON.parse(raw) as StreamMessage;
  } catch {
    return;
  }
  if (msg.type === 'log' && msg.text) {
    pushLog(msg.text);
    return;
  }
  if (msg.type === 'error') {
    pushLog(`分析失败：${msg.message ?? '未知错误'}`);
    return;
  }
  if (msg.type === 'result') {
    candidates.value = (msg.features ?? []).map((item) => ({ ...item, key: item.durations }));
    const count = candidates.value.length;
    pushLog(count ? `共 ${count} 条候选，请确认哪些是广告` : '未发现候选广告');
  }
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
  candidates.value = [];
  logs.value = [];
  logVisible.value = true;
  try {
    const res = await fetch(`/api/admin/sources/${adsSourceId.value}/ads/analyze-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) handleStreamMessage(line);
        index = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) handleStreamMessage(buffer.trim());
  } catch (error) {
    pushLog(`分析失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    analyzing.value = false;
  }
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
  void nextTick(observeConfirmed);
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
              <el-button :disabled="analyzing || !adsSourceId" :loading="picking" @click="pickVods">随机选片</el-button>
              <el-button type="primary" :loading="analyzing" @click="startAnalyze">开始分析</el-button>
            </div>
          </div>

          <div class="ads-sub">
            已选影片
            <span v-if="sampleVods.length" class="ads-count">{{ sampleVods.length }}</span>
          </div>
          <el-table :data="sampleVods" border size="small" height="196" class="vod-table">
            <el-table-column prop="name" label="作品" min-width="140" show-overflow-tooltip />
            <el-table-column prop="episode" label="集数" width="88" align="center" />
            <template #empty>
              <span class="ads-empty">点击「随机选片」抽取 5 部作品</span>
            </template>
          </el-table>

          <div class="ads-sub">
            候选广告特征
            <span v-if="candidateFeatures.length" class="ads-count">{{ candidateFeatures.length }}</span>
          </div>
          <el-table :data="candidateFeatures" size="small" border height="196">
            <el-table-column label="类型" width="76" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.kind === 3 ? 'warning' : 'primary'">{{ kindText(row.kind) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时长序列（秒）" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.durations.split(',').join(' / ') }}</template>
            </el-table-column>
            <el-table-column label="总长" width="88" align="center">
              <template #default="{ row }">{{ secondsText(row.totalMs) }}</template>
            </el-table-column>
            <el-table-column label="命中" width="72" align="center">
              <template #default="{ row }">{{ row.hitVods }} 部</template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openFeature(row)">查看</el-button>
                <el-button link type="success" @click="confirmAd(row)">是广告</el-button>
                <el-button link type="danger" @click="dismissAd(row)">否</el-button>
              </template>
            </el-table-column>
            <template #empty>点「开始分析」提取候选广告</template>
          </el-table>

          <div class="ads-sub">
            已设置的广告特征
            <span v-if="confirmedFeatures.length" class="ads-count">{{ confirmedFeatures.length }}</span>
          </div>
          <div ref="confirmedWrapRef" class="confirmed-wrap">
          <el-table :data="confirmedFeatures" size="small" border :height="confirmedHeight">
            <el-table-column label="类型" width="76" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.kind === 3 ? 'warning' : 'primary'">{{ kindText(row.kind) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时长序列（秒）" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.durations.split(',').join(' / ') }}</template>
            </el-table-column>
            <el-table-column label="总长" width="88" align="center">
              <template #default="{ row }">{{ secondsText(row.totalMs) }}</template>
            </el-table-column>
            <el-table-column label="命中" width="72" align="center">
              <template #default="{ row }">{{ row.hitVods }} 部</template>
            </el-table-column>
            <el-table-column label="操作" width="104" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openFeature(row)">查看</el-button>
                <el-button link type="info" @click="removeFeature(row)">撤销</el-button>
              </template>
            </el-table-column>
            <template #empty>还没有确认的广告特征</template>
          </el-table>
          </div>
        </aside>
      </div>
    </el-card>

    <el-dialog v-model="logVisible" title="分析日志" width="680px">
      <div ref="logRef" class="log-box dialog-log">
        <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
        <div v-if="!logs.length" class="ads-empty">准备中…</div>
      </div>
    </el-dialog>

    <el-dialog v-model="featureVisible" title="广告特征" width="720px" @closed="closeFeature">
      <div class="player">
        <video ref="videoRef" controls playsinline class="player-video" />
        <div v-if="!playerUrl" class="player-empty">选择作品后加载，自动跳到广告位置</div>
      </div>

      <div v-if="activeResult" class="sample-bar">
        <el-select
          v-model="sampleIndex"
          class="sample-select"
          placeholder="选择作品"
          :disabled="!activeResult.sample || !activeResult.sample.length"
        >
          <el-option
            v-for="(item, index) in activeResult.sample ?? []"
            :key="index"
            :label="`${item.vod_name}（${(item.start_sec ?? 0).toFixed(1)} 秒起）`"
            :value="index"
          />
        </el-select>
        <el-button
          type="primary"
          :disabled="!activeResult.sample || !activeResult.sample.length"
          @click="loadSample(sampleIndex)"
        >
          加载并跳到广告
        </el-button>
        <el-button type="success" :disabled="!activeCandidate" @click="judge(true)">是广告</el-button>
        <el-button type="danger" @click="judge(false)">不是广告</el-button>
      </div>

      <el-descriptions v-if="activeResult" :column="2" border size="small">
        <el-descriptions-item label="类型">{{ kindText(activeResult.kind) }}</el-descriptions-item>
        <el-descriptions-item label="总长">{{ secondsText(activeResult.totalMs) }}</el-descriptions-item>
        <el-descriptions-item label="命中作品">{{ activeResult.hitVods }} 部</el-descriptions-item>
        <el-descriptions-item label="判定">
          {{ activeResult.status === 1 ? '已确认是广告' : activeResult.status === 2 ? '已排除' : '待确认' }}
        </el-descriptions-item>
        <el-descriptions-item label="时长序列" :span="2">
          {{ activeResult.durations.split(',').join(' / ') }}
        </el-descriptions-item>
        <el-descriptions-item label="命中样例" :span="2">
          <span v-if="activeResult.sample && activeResult.sample.length">
            {{ activeResult.sample.map((s) => s.vod_name).join('、') }}
          </span>
          <span v-else>—</span>
        </el-descriptions-item>
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
.confirmed-wrap {
  flex: 1;
  min-height: 132px;
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
.dialog-log {
  height: 260px;
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
.player {
  position: relative;
  margin-bottom: 12px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  aspect-ratio: 16 / 9;
}
.player-video {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}
.player-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}
.sample-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.sample-select {
  flex: 1;
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
