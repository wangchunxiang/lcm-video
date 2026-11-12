<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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

const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ keyword: '', kind: '' as '' | Kind, year: '' });
/** 点「查询」时把条件拍下来，输入框改动不会立刻改列表 */
const applied = reactive({ keyword: '', kind: '' as '' | Kind, year: '' });

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;

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

/** 三类分组拉平成一张表：类型列区分来源，排序按「可合并 → 疑似 → 同源」 */
const rows = computed<LightGroup[]>(() => {
  const data = preview.value;
  if (!data) return [];
  return [...data.auto, ...data.suspects, ...data.same];
});

const filtered = computed(() => {
  const word = applied.keyword.trim();
  const year = applied.year.trim();
  return rows.value.filter((row) => {
    if (applied.kind && row.kind !== applied.kind) return false;
    if (word && !row.name.includes(word)) return false;
    if (year && String(row.year) !== year) return false;
    return true;
  });
});

const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

const checked = ref<LightGroup[]>([]);

const groupId = (group: LightGroup): string => `${group.kind}:${group.key}`;

const drawerVisible = ref(false);
const activeGroup = ref<LightGroup | null>(null);
const detail = ref<GroupDetail | null>(null);
const detailLoading = ref(false);
const keepId = ref('');

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

async function load(): Promise<void> {
  loading.value = true;
  try {
    preview.value = await api.post<Preview>('/vod-merge/preview');
    checked.value = [];
    if (activeGroup.value) {
      // 合并/忽略之后这组可能已经不存在，抽屉关掉避免停在旧数据上
      const alive = rows.value.some((row) => groupId(row) === groupId(activeGroup.value!));
      if (!alive) closeDrawer();
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

function search(): void {
  applied.keyword = filters.keyword;
  applied.kind = filters.kind;
  applied.year = filters.year;
  page.value = 1;
}

function reset(): void {
  filters.keyword = '';
  filters.kind = '';
  filters.year = '';
  search();
}

function onPageChange(value: number): void {
  page.value = value;
}

function onSizeChange(size: number): void {
  pageSize.value = size;
  page.value = 1;
}

function onSelectionChange(list: LightGroup[]): void {
  checked.value = list;
}

function closeDrawer(): void {
  drawerVisible.value = false;
  activeGroup.value = null;
  detail.value = null;
  keepId.value = '';
}

async function open(group: LightGroup): Promise<void> {
  activeGroup.value = group;
  detail.value = null;
  keepId.value = '';
  drawerVisible.value = true;
  detailLoading.value = true;
  try {
    const data = await api.post<GroupDetail>('/vod-merge/group', { key: group.key, kind: group.kind });
    detail.value = data;
    const sorted = [...data.members].sort((a, b) => b.playCount - a.playCount || compareId(a.id, b.id));
    keepId.value = sorted[0]?.id ?? '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败');
    closeDrawer();
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
    const res = await api.post<{ merged: number }>('/vod-merge/merge', {
      ids: group.members.map((item) => item.id),
      keepId: keep.id,
    });
    ElMessage.success(`已合并 ${res.merged} 条`);
    closeDrawer();
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

async function ignoreOne(group: LightGroup): Promise<void> {
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
    if (activeGroup.value && groupId(activeGroup.value) === groupId(group)) closeDrawer();
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
    closeDrawer();
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  } finally {
    busy.value = false;
  }
}

async function batchMerge(): Promise<void> {
  const keys = checked.value.map((group) => ({ key: group.key, kind: group.kind }));
  if (keys.length === 0) return;

  let plan: { groups: number; vods: number; skipped: number };
  try {
    plan = await api.post<{ groups: number; vods: number; skipped: number }>('/vod-merge/batch-keys', {
      keys,
      action: 'merge',
      confirm: false,
    });
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
    const res = await api.post<{ groups: number; merged: number; skipped: number }>('/vod-merge/batch-keys', {
      keys,
      action: 'merge',
      confirm: true,
    });
    const after = res.skipped > 0 ? `，跳过 ${res.skipped} 组` : '';
    ElMessage.success(`已合并 ${res.groups} 组，删除 ${res.merged} 条${after}`);
    closeDrawer();
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
    const res = await api.post<{ ignored: number }>('/vod-merge/batch-keys', {
      keys,
      action: 'ignore',
      confirm: true,
    });
    ElMessage.success(`已忽略 ${res.ignored} 组`);
    closeDrawer();
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '忽略失败');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load();
  if (wrapRef.value) {
    resizeObserver = new ResizeObserver(() => {
      tableHeight.value = wrapRef.value?.clientHeight ?? 400;
    });
    resizeObserver.observe(wrapRef.value);
    tableHeight.value = wrapRef.value.clientHeight;
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
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
        <el-input
          v-model="filters.year"
          placeholder="年份"
          clearable
          style="width: 110px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button :disabled="checked.length === 0 || busy" @click="batchMerge">合并所选</el-button>
        <el-button :disabled="checked.length === 0 || busy" @click="batchIgnore">忽略所选</el-button>
        <el-button
          type="primary"
          :disabled="summary.autoGroups === 0 || busy"
          :loading="busy"
          @click="mergeAll"
        >
          一键合并可合并的
        </el-button>
        <span class="hint right">
          共 {{ filtered.length }} 组 · 合并后减少 {{ summary.autoVods }} 条影片
          <template v-if="summary.conflictGroups"> · 年份冲突 {{ summary.conflictGroups }} 组已排除</template>
          <template v-if="summary.ignored"> · 已忽略 {{ summary.ignored }} 组</template>
        </span>
      </div>

      <div ref="wrapRef" class="table-wrap">
        <el-table
          v-loading="loading"
          :data="paged"
          border
          stripe
          :height="tableHeight"
          row-key="key"
          @selection-change="onSelectionChange"
        >
          <el-table-column type="selection" width="44" />
          <el-table-column label="片名" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="name">{{ row.name }}</span>
              <el-tag
                v-if="row.matchedBy === 'actor'"
                type="success"
                size="small"
                effect="plain"
                class="name-tag"
              >
                演员一致 {{ Math.round((row.actorOverlap ?? 0) * 100) }}%
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="年份" width="90" align="center">
            <template #default="{ row }">{{ row.year > 0 ? row.year : '未知' }}</template>
          </el-table-column>
          <el-table-column label="类型" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="kindTagType(row.kind)" size="small" effect="plain">
                {{ kindText(row.kind) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="count" label="条数" width="80" align="center" />
          <el-table-column prop="playTotal" label="线路" width="80" align="center" />
          <el-table-column label="操作" width="150" align="center">
            <template #default="{ row }">
              <el-button link type="primary" @click="open(row)">查看</el-button>
              <el-button link type="danger" :disabled="busy" @click="ignoreOne(row)">忽略</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty">没有待处理的重复影片</div>
          </template>
        </el-table>
      </div>

      <el-pagination
        class="pager"
        layout="total, sizes, prev, pager, next"
        :total="filtered.length"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20, 50, 100]"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-card>

    <el-drawer v-model="drawerVisible" size="620px" :before-close="closeDrawer" destroy-on-close>
      <template #header>
        <div class="drawer-head">
          <span class="drawer-title">{{ activeGroup?.name }}</span>
          <el-tag v-if="activeGroup" :type="kindTagType(activeGroup.kind)" size="small" effect="plain">
            {{ kindText(activeGroup.kind) }}
          </el-tag>
          <el-tag
            v-if="activeGroup?.matchedBy === 'actor'"
            type="success"
            size="small"
            effect="plain"
          >
            演员一致 {{ Math.round((activeGroup.actorOverlap ?? 0) * 100) }}%
          </el-tag>
        </div>
      </template>

      <div v-loading="detailLoading" class="drawer-body">
        <p class="drawer-hint">勾选要保留的那条，其余并入后删除（线路会搬过来）。</p>

        <div class="members">
          <label
            v-for="member in detail?.members ?? []"
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
                  {{ line.sourceName }} · {{ line.sourceFrom }} · <b>{{ line.episodes ?? 0 }}</b> 集
                  <template v-if="line.updatedAt"> · 更新 {{ line.updatedAt.slice(5) }}</template>
                </span>
                <span v-if="member.lines.length === 0" class="muted">没有线路</span>
              </div>
            </div>

            <span v-if="member.id === keepId" class="keep-badge">保留</span>
          </label>
        </div>

        <p v-if="!detailLoading && (detail?.members.length ?? 0) === 0" class="empty">这组影片已经不存在了</p>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button :disabled="busy || !activeGroup" @click="activeGroup && ignoreOne(activeGroup)">
            不是重复，忽略
          </el-button>
          <el-button type="primary" :loading="busy" :disabled="!detail" @click="mergeCurrent">
            合并并删除其余 {{ Math.max((detail?.members.length ?? 1) - 1, 0) }} 条
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
/* 版式与采集源站一致：查询卡片 + 表格卡片 + 分页，各自持有样式，不抽公共模板 */
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
  padding: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.toolbar .right {
  margin-left: auto;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.pager {
  margin-top: 12px;
  justify-content: flex-end;
}

.name {
  color: var(--el-text-color-primary);
}

.name-tag {
  margin-left: 8px;
}

.empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.drawer-body {
  min-height: 160px;
}

.drawer-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.members {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member {
  display: flex;
  align-items: center;
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

.muted {
  color: var(--el-text-color-secondary);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
