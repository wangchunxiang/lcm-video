<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface LightGroup {
  key: string;
  kind: 'auto' | 'suspect' | 'same';
  name: string;
  year: number;
  count: number;
  playTotal: number;
  matchedBy?: 'strict' | 'actor';
  actorOverlap?: number;
}

interface MemberLine {
  sourceId: number;
  sourceFrom: string;
  sourceName: string;
  episodes?: number;
  updatedAt?: string;
}

interface Member {
  id: number;
  name: string;
  year: number;
  status: number;
  cover: string;
  playCount: number;
  collectedAt: string;
  lines: MemberLine[];
  subName?: string;
  category?: string;
  area?: string;
  lang?: string;
  actor?: string;
  episodeCount?: number;
}

interface GroupDetail {
  key: string;
  kind: 'auto' | 'suspect' | 'same';
  name: string;
  year: number;
  members: Member[];
  playTotal: number;
}

interface Preview {
  computing?: boolean;
  auto: LightGroup[];
  suspects: LightGroup[];
  same: LightGroup[];
  summary: {
    autoGroups: number;
    autoVods: number;
    suspectGroups: number;
    sameGroups: number;
    conflictGroups: number;
    ignored: number;
  };
}

/** 封面加载失败时的占位图，用内联 SVG 避免再发一次请求（否则会反复触发 error 闪烁） */
const COVER_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><rect width="48" height="64" fill="#dcdfe6"/><text x="24" y="36" font-size="10" fill="#909399" text-anchor="middle">无封面</text></svg>',
  );

/** 只兜底一次，防止占位图再次失败时进死循环 */
const onCoverError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  if (img.dataset.fallback === '1') return;
  img.dataset.fallback = '1';
  img.src = COVER_PLACEHOLDER;
};

const loading = ref(false);
const busy = ref(false);
const preview = ref<Preview | null>(null);
const tab = ref<'auto' | 'suspect' | 'same'>('auto');
const keyword = ref('');
const activeGroup = ref<LightGroup | null>(null);
const detail = ref<GroupDetail | null>(null);
const detailLoading = ref(false);
const keepId = ref(0);

const summary = computed(
  () =>
    preview.value?.summary ?? {
      autoGroups: 0,
      autoVods: 0,
      suspectGroups: 0,
      sameGroups: 0,
      conflictGroups: 0,
      ignored: 0,
    },
);

const groups = computed(() => {
  if (tab.value === 'auto') return preview.value?.auto ?? [];
  if (tab.value === 'suspect') return preview.value?.suspects ?? [];
  return preview.value?.same ?? [];
});

const filtered = computed(() => {
  const word = keyword.value.trim();
  if (!word) return groups.value;
  return groups.value.filter((group) => group.name.includes(word));
});

const isActive = (group: LightGroup): boolean =>
  activeGroup.value?.key === group.key && activeGroup.value?.kind === group.kind;

const distinctNames = computed(() => new Set((detail.value?.members ?? []).map((item) => item.name)));

const PUNCT = /[·•・:：,，、。.;；!！?？'"“”‘’《》<>()（）【】{}—–\-_~～+＋&＆/\\]/;

/** 把与同组其它影片不同的字符标出来：空白标蓝、标点标橙 */
function marks(name: string): Array<{ ch: string; cls: string }> {
  if (distinctNames.value.size <= 1) return [...name].map((ch) => ({ ch, cls: '' }));
  return [...name].map((ch) => ({
    ch,
    cls: /\s/.test(ch) ? 'ws' : PUNCT.test(ch) ? 'punct' : '',
  }));
}

function kindText(kind: 'auto' | 'suspect' | 'same'): string {
  if (kind === 'auto') return '可合并';
  if (kind === 'suspect') return '疑似重复';
  return '同源重复';
}

function kindTagType(kind: 'auto' | 'suspect' | 'same'): 'success' | 'warning' | 'danger' {
  if (kind === 'auto') return 'success';
  if (kind === 'suspect') return 'warning';
  return 'danger';
}

function statusText(status: number): string {
  return status === 1 ? '已上架' : '已下架';
}

function yearText(member: Member): string {
  return member.year > 0 ? `${member.year}` : '未知';
}

/** 演员只取前三位，避免把长名单铺满一行 */
function firstActors(actor?: string): string {
  const list = (actor ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.slice(0, 3).join('、');
}

/** 该组里集数最多的线路，用来高亮「谁更完整」 */
const maxEpisodes = computed(() => {
  let max = 0;
  for (const member of detail.value?.members ?? []) {
    for (const line of member.lines) max = Math.max(max, line.episodes ?? 0);
  }
  return max;
});

let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** 服务刚启动时快照还没算好，返回 computing，过两秒再取一次 */
function schedulePoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void load(true);
  }, 2000);
}

async function load(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  try {
    const data = await api.get<Preview>('/tools/merge-vods/preview');
    preview.value = data;
    if (data.computing) schedulePoll();
    if (groups.value.length === 0) {
      activeGroup.value = null;
      detail.value = null;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
  } finally {
    if (!silent) loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});

async function select(group: LightGroup): Promise<void> {
  activeGroup.value = group;
  detail.value = null;
  detailLoading.value = true;
  try {
    const data = await api.get<GroupDetail>(
      `/tools/merge-vods/group?key=${group.key}&kind=${group.kind}`,
    );
    detail.value = data;
    const sorted = [...data.members].sort((a, b) => b.playCount - a.playCount || a.id - b.id);
    keepId.value = sorted[0]?.id ?? 0;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function mergeCurrent(): Promise<void> {
  const group = detail.value;
  if (!group) return;
  const keep = group.members.find((item) => item.id === keepId.value) ?? group.members[0];
  if (!keep) return;

  try {
    await ElMessageBox.confirm(
      `保留《${keep.name}》（ID ${keep.id}），把其余 ${group.members.length - 1} 条并进去并删除，确定吗？`,
      '合并影片',
      { type: 'warning', confirmButtonText: '合并', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  busy.value = true;
  try {
    const res = await api.post<{ merged: number }>('/tools/merge-vods', {
      ids: group.members.map((item) => item.id),
      keep_id: keep.id,
    });
    ElMessage.success(`已合并 ${res.merged} 条`);
    activeGroup.value = null;
    detail.value = null;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

async function ignoreCurrent(): Promise<void> {
  const group = activeGroup.value;
  if (!group) return;

  try {
    await ElMessageBox.confirm('把这组标记为「不是重复」，以后不再出现在列表里，确定吗？', '忽略这组', {
      type: 'info',
      confirmButtonText: '忽略',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  busy.value = true;
  try {
    await api.post('/tools/merge-vods/ignore', { key: group.key, kind: group.kind, ignored: true });
    ElMessage.success('已忽略这组');
    activeGroup.value = null;
    detail.value = null;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  } finally {
    busy.value = false;
  }
}

async function mergeAll(): Promise<void> {
  if (summary.value.autoGroups === 0) return;
  let plan: { groups: number; vods: number };
  try {
    plan = await api.post<{ groups: number; vods: number }>('/tools/merge-vods/batch', { confirm: false });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `将合并 ${plan.groups} 组、删除 ${plan.vods} 条重复影片，确定继续吗？`,
      '一键合并',
      { type: 'warning', confirmButtonText: '全部合并', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  busy.value = true;
  try {
    const res = await api.post<{ groups: number; merged: number }>('/tools/merge-vods/batch', { confirm: true });
    ElMessage.success(`已合并 ${res.groups} 组，删除 ${res.merged} 条`);
    activeGroup.value = null;
    detail.value = null;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

/* ---------- 左列多选 ---------- */

const checked = ref<LightGroup[]>([]);

const groupId = (group: LightGroup): string => `${group.kind}:${group.key}`;

const isChecked = (group: LightGroup): boolean =>
  checked.value.some((item) => groupId(item) === groupId(group));

function toggleChecked(group: LightGroup): void {
  const id = groupId(group);
  checked.value = isChecked(group)
    ? checked.value.filter((item) => groupId(item) !== id)
    : [...checked.value, group];
}

const allChecked = computed(
  () => filtered.value.length > 0 && filtered.value.every((group) => isChecked(group)),
);

const someChecked = computed(() => checked.value.length > 0 && !allChecked.value);

function toggleAll(value: boolean | string | number): void {
  checked.value = value ? [...filtered.value] : [];
}

watch(tab, () => {
  checked.value = [];
});

async function batchMerge(): Promise<void> {
  const keys = checked.value.map((group) => ({ key: group.key, kind: group.kind }));
  if (keys.length === 0) return;

  let plan: { groups: number; vods: number; skipped: number };
  try {
    plan = await api.post<{ groups: number; vods: number; skipped: number }>(
      '/tools/merge-vods/batch-keys',
      { keys, action: 'merge', confirm: false },
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    return;
  }

  if (plan.groups === 0) {
    ElMessage.warning(`所选 ${keys.length} 组的年份都冲突，不能自动合并`);
    return;
  }

  const skipText = plan.skipped > 0 ? `，另有 ${plan.skipped} 组年份冲突会跳过` : '';
  try {
    await ElMessageBox.confirm(
      `将合并 ${plan.groups} 组、删除 ${plan.vods} 条重复影片${skipText}，确定继续吗？`,
      '合并所选',
      { type: 'warning', confirmButtonText: '合并', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  busy.value = true;
  try {
    const res = await api.post<{ groups: number; merged: number; skipped: number }>(
      '/tools/merge-vods/batch-keys',
      { keys, action: 'merge', confirm: true },
    );
    const after = res.skipped > 0 ? `，跳过 ${res.skipped} 组` : '';
    ElMessage.success(`已合并 ${res.groups} 组，删除 ${res.merged} 条${after}`);
    checked.value = [];
    activeGroup.value = null;
    detail.value = null;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

async function batchIgnore(): Promise<void> {
  const keys = checked.value.map((group) => ({ key: group.key, kind: group.kind }));
  if (keys.length === 0) return;

  try {
    await ElMessageBox.confirm(
      `把这 ${keys.length} 组标记为「不是重复」，之后不再出现在列表里，确定吗？`,
      '忽略所选',
      { type: 'warning', confirmButtonText: '忽略', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  busy.value = true;
  try {
    const res = await api.post<{ ignored: number }>('/tools/merge-vods/batch-keys', {
      keys,
      action: 'ignore',
      confirm: true,
    });
    ElMessage.success(`已忽略 ${res.ignored} 组`);
    checked.value = [];
    activeGroup.value = null;
    detail.value = null;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '忽略失败');
  } finally {
    busy.value = false;
  }
}

onMounted(load);</script>

<template>
  <div class="page">
    <el-card class="page-card" v-loading="loading">
      <div class="head">
        <div class="summary">
          <span>可自动合并 <b>{{ summary.autoGroups }}</b> 组（减少 {{ summary.autoVods }} 条）</span>
          <span>疑似重复 <b>{{ summary.suspectGroups }}</b> 组</span>
          <span>同源同 ID <b>{{ summary.sameGroups }}</b> 组</span>
          <span class="muted">年份冲突 {{ summary.conflictGroups }} 组已排除<span v-if="summary.ignored"> · 已忽略 {{ summary.ignored }} 组</span></span>
        </div>
        <div class="head-actions">
          <el-button :loading="loading" @click="load()">刷新</el-button>
          <el-button type="primary" :disabled="summary.autoGroups === 0" :loading="busy" @click="mergeAll">
            一键合并可合并的
          </el-button>
        </div>
      </div>

      <div class="body">
        <aside class="left">
          <el-radio-group v-model="tab" size="small" class="tabs">
            <el-radio-button value="auto">可合并 {{ summary.autoGroups }}</el-radio-button>
            <el-radio-button value="suspect">疑似 {{ summary.suspectGroups }}</el-radio-button>
            <el-radio-button value="same">同源同 ID {{ summary.sameGroups }}</el-radio-button>
          </el-radio-group>
          <el-input v-model="keyword" size="small" placeholder="搜索片名" clearable />

          <div class="list-toolbar">
            <el-checkbox
              :model-value="allChecked"
              :indeterminate="someChecked"
              @change="toggleAll"
            >
              全选
            </el-checkbox>
            <div class="list-actions">
              <el-button size="small" :disabled="checked.length === 0 || busy" @click="batchMerge">
                合并所选
              </el-button>
              <el-button size="small" :disabled="checked.length === 0 || busy" @click="batchIgnore">
                忽略所选
              </el-button>
            </div>
          </div>

          <div class="list">
            <div
              v-for="group in filtered"
              :key="`${group.kind}:${group.key}`"
              class="item"
              :class="{ active: isActive(group) }"
              role="button"
              tabindex="0"
              @click="select(group)"
              @keydown.enter="select(group)"
            >
              <el-checkbox
                class="item-check"
                :model-value="isChecked(group)"
                @click.stop
                @change="toggleChecked(group)"
              />
              <span class="item-name">{{ group.name }}</span>
              <span v-if="group.matchedBy === 'actor'" class="item-tag">演员一致</span>
              <span class="item-count">{{ group.count }}</span>
            </div>
            <div v-if="filtered.length === 0" class="list-empty">没有待处理的分组</div>
          </div>
        </aside>

        <section class="right" v-loading="detailLoading">
          <div v-if="!detail" class="empty">
            <p>从左侧选一组影片，这里会列出它名下的每一条记录，勾选要保留的那条，其余并入后删除。</p>
            <p class="empty-note">判重只按「名称 + 年份」，名称里的空格会被忽略，标点则算作差异。</p>
            <p class="empty-note">「同源同 ID」是同一采集源的同一个条目挂在两部影片上，属于必定的重复。</p>
          </div>

          <template v-else>
            <div class="detail-head">
              <div class="detail-title">
                <span class="detail-name">{{ detail.name }}</span>
                <el-tag :type="kindTagType(detail.kind)" size="small" effect="plain">
                  {{ kindText(detail.kind) }}
                </el-tag>
                <el-tag v-if="activeGroup?.matchedBy === 'actor'" type="success" size="small" effect="plain">
                  演员一致 {{ Math.round((activeGroup.actorOverlap ?? 0) * 100) }}%
                </el-tag>
              </div>
              <div class="detail-actions">
                <el-button size="small" :disabled="busy" @click="ignoreCurrent">不是重复，忽略</el-button>
                <el-button size="small" type="primary" :loading="busy" @click="mergeCurrent">
                  合并并删除其余
                </el-button>
              </div>
            </div>

            <div class="members">
              <label
                v-for="member in detail.members"
                :key="member.id"
                class="member"
                :class="{ chosen: member.id === keepId }"
              >
                <el-radio v-model="keepId" :value="member.id" class="member-radio">
                  <span class="sr-only">保留这条</span>
                </el-radio>

                <img class="cover" :src="member.cover || COVER_PLACEHOLDER" alt="" @error="onCoverError" />

                <div class="member-main">
                  <div class="member-name">
                    <span v-for="(mark, index) in marks(member.name)" :key="index" :class="mark.cls">{{ mark.ch }}</span>
                  </div>
                  <div class="member-meta">
                    <span><i>ID</i> {{ member.id }}</span>
                    <span><i>年份</i> {{ yearText(member) }}</span>
                    <span><i>分类</i> {{ member.category || '—' }}</span>
                    <span><i>地区</i> {{ member.area || '—' }}</span>
                    <span><i>语言</i> {{ member.lang || '—' }}</span>
                    <span><i>总集数</i> {{ member.episodeCount || '—' }}</span>
                    <span><i>状态</i> {{ statusText(member.status) }}</span>
                    <span><i>演员</i> {{ firstActors(member.actor) || '—' }}</span>
                    <span class="muted"><i>采集</i> {{ member.collectedAt }}</span>
                  </div>
                  <div class="member-lines">
                    <span
                      v-for="line in member.lines"
                      :key="`${line.sourceId}-${line.sourceFrom}`"
                      class="line-chip"
                      :class="{ best: (line.episodes ?? 0) > 0 && line.episodes === maxEpisodes }"
                    >
                      {{ line.sourceName }} · {{ line.sourceFrom }} ·
                      <b>{{ line.episodes ?? 0 }}</b> 集
                      <template v-if="line.updatedAt"> · 更新 {{ line.updatedAt.slice(5) }}</template>
                    </span>
                    <span v-if="member.lines.length === 0" class="muted">没有线路</span>
                  </div>
                </div>

                <span v-if="member.id === keepId" class="keep-badge">保留</span>
              </label>
            </div>
          </template>
        </section>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
}

.page-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.summary {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.summary b {
  color: var(--el-text-color-primary);
}

.muted {
  color: var(--el-text-color-secondary);
}

.head-actions {
  display: flex;
  gap: 8px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.left {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.tabs {
  display: flex;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.item-check {
  flex: none;
  height: 16px;
  margin-right: -2px;
}

.item-check :deep(.el-checkbox__label) {
  display: none;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.list-actions {
  display: flex;
  gap: 6px;
}

.item:hover {
  background: var(--el-fill-color-light);
}

.item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item-count {
  flex: none;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.item-tag {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 2px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.list-empty,
.empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.list-empty {
  padding: 16px 8px;
  text-align: center;
}

.right {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 16px;
}

.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}

.empty-note {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.detail-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.members {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
}

.member.chosen {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.member-radio {
  flex: none;
  margin-right: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.cover {
  width: 48px;
  height: 64px;
  flex: none;
  border-radius: 4px;
  object-fit: fill;
  background: var(--el-fill-color-light);
}

.member-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.member-name .ws {
  background: var(--el-color-primary-light-8);
  border-radius: 2px;
}

.member-name .punct {
  background: var(--el-color-warning-light-8);
  border-radius: 2px;
}

.member-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.member-meta i {
  font-style: normal;
  color: var(--el-text-color-placeholder);
  margin-right: 2px;
}

.member-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.line-chip {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.line-chip b {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.line-chip.best {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.line-chip.best b {
  color: var(--el-color-primary);
}

.keep-badge {
  flex: none;
  font-size: 12px;
  color: var(--el-color-primary);
}
</style>
