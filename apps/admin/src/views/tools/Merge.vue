<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

type Kind = 'auto' | 'suspect' | 'same';

interface LightGroup {
  key: string;
  kind: Kind;
  name: string;
  year: number;
  count: number;
  playTotal: number;
  matchedBy?: 'strict' | 'actor';
  actorOverlap?: number;
}

interface MemberLine {
  sourceId: string;
  sourceFrom: string;
  sourceName: string;
  episodes?: number;
  updatedAt?: string;
}

interface Member {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
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
  kind: Kind;
  name: string;
  year: number;
  members: Member[];
  playTotal: number;
}

interface Preview {
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

/** 左侧列表滚动加载：一次追加 20 组，到底自动再要一批 */
const PAGE = 20;
const visibleCount = ref(PAGE);
const filters = reactive({ keyword: '', kind: '' as '' | Kind });
/** 点「查询」时把条件拍下来，输入框改动不会立刻改列表 */
const applied = reactive({ keyword: '', kind: '' as '' | Kind });

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

/** 三类分组拉平成一份列表：类型列区分来源，顺序是「可合并 → 疑似 → 同源」 */
const rows = computed<LightGroup[]>(() => {
  const data = preview.value;
  if (!data) return [];
  return [...data.auto, ...data.suspects, ...data.same];
});

const filtered = computed(() => {
  const word = applied.keyword.trim();
  return rows.value.filter((row) => {
    if (applied.kind && row.kind !== applied.kind) return false;
    if (word && !row.name.includes(word)) return false;
    return true;
  });
});

const visibleGroups = computed(() => filtered.value.slice(0, visibleCount.value));

const groupId = (group: LightGroup): string => `${group.kind}:${group.key}`;

const activeKey = ref('');
const detail = ref<GroupDetail | null>(null);
const detailLoading = ref(false);
const keepId = ref('');

/** 左栏多选：存 `kind:key`，批量忽略/合并用 */
const selected = ref<string[]>([]);
const selectedGroups = computed(() => rows.value.filter((row) => selected.value.includes(groupId(row))));

function isSelected(group: LightGroup): boolean {
  return selected.value.includes(groupId(group));
}

function toggleSelect(group: LightGroup): void {
  const id = groupId(group);
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}

/** 全选当前筛选结果（不只是已滚动出来的那些） */
function selectAll(): void {
  selected.value = filtered.value.map((group) => groupId(group));
}

function clearSelection(): void {
  selected.value = [];
}

const activeGroup = computed(() => rows.value.find((row) => groupId(row) === activeKey.value) ?? null);

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

function kindText(kind: Kind): string {
  if (kind === 'auto') return '可合并';
  if (kind === 'suspect') return '疑似重复';
  return '同源同 ID';
}

function kindTagType(kind: Kind): 'success' | 'warning' | 'info' {
  if (kind === 'auto') return 'success';
  if (kind === 'suspect') return 'warning';
  return 'info';
}

function statusText(status: number): string {
  return status === 1 ? '已上架' : '已下架';
}

/** BIGINT 主键是字符串，按数值比较大小 */
function compareId(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

async function loadDetail(group: LightGroup): Promise<void> {
  detailLoading.value = true;
  detail.value = null;
  keepId.value = '';
  try {
    const data = await api.post<GroupDetail>('/vod-merge/group', { key: group.key, kind: group.kind });
    detail.value = data;
    const sorted = [...data.members].sort((a, b) => b.playCount - a.playCount || compareId(a.id, b.id));
    keepId.value = sorted[0]?.id ?? '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    preview.value = await api.post<Preview>('/vod-merge/preview');
    // 数据刷新后清掉已经不存在的勾选，避免批量操作打到旧分组上
    const aliveKeys = new Set(rows.value.map((row) => groupId(row)));
    selected.value = selected.value.filter((id) => aliveKeys.has(id));
    const alive = rows.value.find((row) => groupId(row) === activeKey.value);
    const next = alive ?? visibleGroups.value[0] ?? filtered.value[0];
    if (next) {
      activeKey.value = groupId(next);
      await loadDetail(next);
    } else {
      activeKey.value = '';
      detail.value = null;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 查询：应用筛选条件，同时重新拉一次服务端数据（原来的「刷新」按钮已去掉） */
function search(): void {
  applied.keyword = filters.keyword;
  applied.kind = filters.kind;
  visibleCount.value = PAGE;
  void load();
}

function reset(): void {
  filters.keyword = '';
  filters.kind = '';
  search();
}

function pick(group: LightGroup): void {
  if (groupId(group) === activeKey.value) return;
  activeKey.value = groupId(group);
  void loadDetail(group);
}

/** 滚到接近底部时再放一批，组多的时候不用点分页 */
function onScroll(event: Event): void {
  const el = event.target as HTMLElement;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 40) return;
  if (visibleCount.value >= filtered.value.length) return;
  visibleCount.value += PAGE;
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
    const res = await api.post<{ merged: number }>('/vod-merge/merge', {
      ids: group.members.map((item) => item.id),
      keepId: keep.id,
    });
    ElMessage.success(`已合并 ${res.merged} 条`);
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
    await api.post('/vod-merge/ignore', { key: group.key, kind: group.kind, ignored: true });
    ElMessage.success('已忽略这组');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  } finally {
    busy.value = false;
  }
}

/** batch-keys 的返回：confirm=false 时是计划，confirm=true 时是执行结果 */
interface BatchPlan {
  needConfirm: boolean;
  action: 'merge' | 'ignore';
  groups: number;
  vods: number;
  merged: number;
  skipped: number;
  ignored: number;
}

/** 对左栏勾选的分组批量合并 / 忽略 */
async function batchSelected(action: 'merge' | 'ignore'): Promise<void> {
  const groups = selectedGroups.value;
  if (groups.length === 0) return;
  const keys = groups.map((group) => ({ key: group.key, kind: group.kind }));

  let plan: BatchPlan;
  try {
    plan = await api.post<BatchPlan>('/vod-merge/batch-keys', { keys, action, confirm: false });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    return;
  }

  const text =
    action === 'merge'
      ? `将合并 ${plan.groups} 组、删除 ${plan.vods} 条重复影片${
          plan.skipped > 0 ? `，另有 ${plan.skipped} 组年份不一致会跳过` : ''
        }，确定吗？`
      : `把这 ${plan.groups} 组标记为「不是重复」，以后不再出现在列表里，确定吗？`;

  try {
    await ElMessageBox.confirm(text, action === 'merge' ? '合并所选分组' : '忽略所选分组', {
      type: action === 'merge' ? 'warning' : 'info',
      confirmButtonText: action === 'merge' ? '合并' : '忽略',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  busy.value = true;
  try {
    const res = await api.post<BatchPlan>('/vod-merge/batch-keys', { keys, action, confirm: true });
    ElMessage.success(
      action === 'merge' ? `已合并 ${res.groups} 组，删除 ${res.merged} 条` : `已忽略 ${res.ignored} 组`,
    );
    selected.value = [];
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
    plan = await api.post<{ groups: number; vods: number }>('/vod-merge/batch', { confirm: false });
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
    const res = await api.post<{ groups: number; merged: number }>('/vod-merge/batch', { confirm: true });
    ElMessage.success(`已合并 ${res.groups} 组，删除 ${res.merged} 条`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <el-input
          v-model="filters.keyword"
          placeholder="片名"
          clearable
          style="width: 220px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.kind" placeholder="全部类型" clearable style="width: 140px">
          <el-option label="可合并" value="auto" />
          <el-option label="疑似重复" value="suspect" />
          <el-option label="同源同 ID" value="same" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="count">已筛选 {{ filtered.length }} 组 · 共 {{ rows.length }} 组</span>
        <span class="bar-right">
          <el-button
            type="primary"
            :disabled="summary.autoGroups === 0 || busy"
            :loading="busy"
            @click="mergeAll"
          >
            一键合并
          </el-button>
        </span>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="split">
        <div class="pane-list">
          <div class="list-head">
            <span class="list-actions-left">
              <el-button :disabled="filtered.length === 0 || busy" @click="selectAll">全选</el-button>
              <el-button :disabled="selected.length === 0 || busy" @click="clearSelection">取消全选</el-button>
            </span>
            <span class="list-actions">
              <el-button :disabled="selectedGroups.length === 0 || busy" @click="batchSelected('ignore')">
                忽略
              </el-button>
              <el-button
                type="primary"
                :disabled="selectedGroups.length === 0 || busy"
                :loading="busy"
                @click="batchSelected('merge')"
              >
                合并
              </el-button>
            </span>
          </div>
          <div class="list-body" @scroll.passive="onScroll">
            <div
              v-for="group in visibleGroups"
              :key="groupId(group)"
              class="group"
              :class="{ on: groupId(group) === activeKey }"
              @click="pick(group)"
            >
              <el-checkbox
                class="g-check"
                :model-value="isSelected(group)"
                @click.stop
                @change="toggleSelect(group)"
              />
              <div class="group-main">
                <div class="group-name">
                  <span class="g-name">{{ group.name }}</span>
                  <el-tag :type="kindTagType(group.kind)" size="small" effect="plain" class="g-tag">
                    {{ kindText(group.kind) }}
                  </el-tag>
                </div>
                <div class="group-meta">
                  <span>{{ group.count }} 条</span>
                  <span>{{ group.playTotal }} 条线路</span>
                  <span v-if="group.matchedBy === 'actor'" class="actor">
                    演员一致 {{ Math.round((group.actorOverlap ?? 0) * 100) }}%
                  </span>
                </div>
              </div>
            </div>
            <div v-if="filtered.length === 0" class="list-empty">没有待处理的重复影片</div>
            <div v-else-if="visibleGroups.length < filtered.length" class="list-more">
              继续向下滚动加载更多
            </div>
          </div>
        </div>

        <div v-loading="detailLoading" class="pane-detail">
          <template v-if="activeGroup">
            <div class="detail-head">
              <span class="detail-title">{{ activeGroup.name }}</span>
              <el-tag :type="kindTagType(activeGroup.kind)" size="small" effect="plain">
                {{ kindText(activeGroup.kind) }}
              </el-tag>
              <el-tag v-if="activeGroup.matchedBy === 'actor'" type="success" size="small" effect="plain">
                演员一致 {{ Math.round((activeGroup.actorOverlap ?? 0) * 100) }}%
              </el-tag>
              <span class="head-right">
                <span class="sub">{{ detail?.members.length ?? 0 }} 条影片 · {{ detail?.playTotal ?? 0 }} 条线路</span>
                <span class="head-actions">
                  <el-button :disabled="busy" @click="ignoreCurrent">忽略</el-button>
                  <el-button
                    type="primary"
                    :loading="busy"
                    :disabled="!detail"
                    :title="`合并并删除其余 ${Math.max((detail?.members.length ?? 1) - 1, 0)} 条`"
                    @click="mergeCurrent"
                  >
                    合并 {{ Math.max((detail?.members.length ?? 1) - 1, 0) }} 条
                  </el-button>
                </span>
              </span>
            </div>

            <div class="detail-body">
              <div
                v-for="member in detail?.members ?? []"
                :key="member.id"
                class="member"
                :class="{ chosen: member.id === keepId }"
                @click="keepId = member.id"
              >
                <el-radio v-model="keepId" :value="member.id" class="member-radio">
                  <span class="sr-only">保留这条</span>
                </el-radio>

                <img class="cover" :src="member.cover || COVER_PLACEHOLDER" alt="" @error="onCoverError" />

                <div class="member-main">
                  <div class="member-name-row">
                    <span class="member-name">
                      <span v-for="(mark, index) in marks(member.name)" :key="index" :class="mark.cls">{{ mark.ch }}</span>
                    </span>
                    <el-tag size="small" effect="plain" type="info">ID {{ member.id }}</el-tag>
                    <el-tag size="small" effect="plain" :type="member.status === 1 ? 'success' : 'info'">
                      {{ statusText(member.status) }}
                    </el-tag>
                  </div>
                  <div class="member-pills">
                    <span class="pill">年份 <b>{{ yearText(member) }}</b></span>
                    <span class="pill">分类 <b>{{ member.category || '—' }}</b></span>
                    <span class="pill">地区 <b>{{ member.area || '—' }}</b></span>
                    <span class="pill">语言 <b>{{ member.lang || '—' }}</b></span>
                    <span class="pill">总集数 <b>{{ member.episodeCount || '—' }}</b></span>
                    <span class="pill">采集 <b>{{ member.collectedAt }}</b></span>
                  </div>
                  <div class="member-actor">演员 {{ firstActors(member.actor) || '—' }}</div>
                  <div class="member-lines">
                    <span
                      v-for="line in member.lines"
                      :key="`${line.sourceId}-${line.sourceFrom}`"
                      class="line-chip"
                      :class="{ best: (line.episodes ?? 0) > 0 && line.episodes === maxEpisodes }"
                    >
                      {{ line.sourceName || line.sourceFrom }} · <b>{{ line.episodes ?? 0 }}</b> 集
                      <template v-if="line.updatedAt"> · 更新 {{ line.updatedAt.slice(5) }}</template>
                    </span>
                    <span v-if="member.lines.length === 0" class="muted">没有线路</span>
                  </div>
                </div>

                <span v-if="member.id === keepId" class="keep-badge">保留</span>
              </div>

              <div v-if="!detailLoading && (detail?.members.length ?? 0) === 0" class="list-empty">
                这组影片已经不存在了
              </div>
            </div>
          </template>

          <div v-else class="list-empty center">左侧没有待处理的重复影片</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
/* 版式：查询卡片 + 一块卡片内左右分栏（左分组列表 / 右成员详情），样式只在本页，不抽公共模板 */
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-card :deep(.el-card__body) {
  padding: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
}

.bar-right {
  margin-left: auto;
  display: flex;
}

.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.split {
  flex: 1;
  min-height: 0;
  display: flex;
}

.pane-list {
  width: 330px;
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
}

.list-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.group {
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.g-check {
  flex: none;
  height: 22px;
  margin-right: 0;
}

.group-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group:hover {
  background: var(--el-fill-color-light);
}

.group.on {
  background: var(--el-color-primary-light-9);
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}

/* 标题与第二行都从同一个左边距起排，标签推到行尾 */
.group-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.g-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}

.g-tag {
  margin-left: auto;
  flex: none;
}

.group-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.actor {
  margin-left: auto;
  color: var(--el-color-success);
}

/* 与右侧 .detail-head 同高，两栏顶部对齐 */
.list-head {
  flex: none;
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.count {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.list-actions-left {
  display: flex;
  align-items: center;
}

.list-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.list-more {
  padding: 10px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.list-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.list-empty.center {
  margin: auto;
}

.pane-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail-head .sub {
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* 行尾：统计文字 + 忽略 / 合并按钮 */
.head-right {
  margin-left: auto;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.head-actions {
  display: flex;
  align-items: center;
  flex: none;
}

/* 窄屏时先让出统计文字的位置，按钮不换行 */
@media (max-width: 1200px) {
  .detail-head .sub {
    display: none;
  }
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
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
  width: 72px;
  height: 96px;
  flex: none;
  border-radius: 4px;
  object-fit: cover;
  background: var(--el-fill-color-light);
}

.member-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.member-name {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
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

.member-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  font-size: 12px;
  line-height: 20px;
  padding: 0 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pill b {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.member-actor {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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

/* 「保留」在卡片行尾，不跟名称挤在一起 */
.keep-badge {
  flex: none;
  align-self: center;
  margin-left: auto;
  font-size: 12px;
  color: var(--el-color-primary);
}

.muted {
  color: var(--el-text-color-secondary);
}
</style>
