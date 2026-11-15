<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';
import { buildListQuery } from '@lcm/api-client';
import { formatDateTime } from '../../utils/datetime.ts';

/** 后端 `/home-hero/rows` 的行：配置 + 影片信息 + 当前是否在播 */
interface HeroRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  vodId: string;
  vodName: string;
  vodCover: string;
  vodYear: number;
  vodRemarks: string;
  categoryName: string;
  title: string;
  subTitle: string;
  bgImage: string;
  remarks: string;
  sort: number;
  isShow: number;
  startAt: string | null;
  endAt: string | null;
  live: boolean;
}

interface VodOption {
  id: string;
  name: string;
  year: number;
  cover: string;
}

const loading = ref(false);
const saving = ref(false);
const items = ref<HeroRow[]>([]);

const dialogVisible = ref(false);
const dialogTitle = ref('新增轮播位');
const editingId = ref('');

const form = reactive({
  vodId: '',
  title: '',
  subTitle: '',
  bgImage: '',
  remarks: '',
  isShow: 1,
  startAt: '',
  endAt: '',
});

const vodOptions = ref<VodOption[]>([]);
const vodSearching = ref(false);

/** 已上满 8 个就不让再加：hero 接口只取前 8 条 */
const MAX_HERO = 8;
const canCreate = computed(() => items.value.length < MAX_HERO);

async function load() {
  loading.value = true;
  try {
    items.value = await api.post<HeroRow[]>('/home-hero/rows');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载轮播位失败');
  } finally {
    loading.value = false;
  }
}

/** 选片：按片名远程搜索（后台 /vod 列表自带 where 过滤） */
async function searchVod(keyword: string) {
  const text = keyword.trim();
  if (!text) {
    vodOptions.value = [];
    return;
  }
  vodSearching.value = true;
  try {
    const query = buildListQuery({
      take: 20,
      skip: 0,
      where: { name: { $like: `%${text}%` } },
      order: { id: 'DESC' },
    });
    const data = await api.get<{ items: VodOption[]; total: number }>('/vod', query);
    vodOptions.value = data.items;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '搜索影片失败');
  } finally {
    vodSearching.value = false;
  }
}

function resetForm() {
  form.vodId = '';
  form.title = '';
  form.subTitle = '';
  form.bgImage = '';
  form.remarks = '';
  form.isShow = 1;
  form.startAt = '';
  form.endAt = '';
  vodOptions.value = [];
  editingId.value = '';
}

function openCreate() {
  if (!canCreate.value) {
    ElMessage.warning(`最多 ${MAX_HERO} 个轮播位`);
    return;
  }
  resetForm();
  dialogTitle.value = '新增轮播位';
  dialogVisible.value = true;
}

function openEdit(row: HeroRow) {
  resetForm();
  editingId.value = row.id;
  form.vodId = row.vodId;
  form.title = row.title;
  form.subTitle = row.subTitle;
  form.bgImage = row.bgImage;
  form.remarks = row.remarks;
  form.isShow = row.isShow;
  form.startAt = row.startAt ? row.startAt.slice(0, 19).replace('T', ' ') : '';
  form.endAt = row.endAt ? row.endAt.slice(0, 19).replace('T', ' ') : '';
  vodOptions.value = [
    { id: row.vodId, name: row.vodName, year: row.vodYear, cover: row.vodCover },
  ];
  dialogTitle.value = '编辑轮播位';
  dialogVisible.value = true;
}

/** DTO 要 ISO 8601；空串表示不限时间 */
function toIso(value: string): string | null {
  if (!value) return null;
  return new Date(value.replace(' ', 'T')).toISOString();
}

async function submit() {
  if (!form.vodId) {
    ElMessage.warning('请选择影片');
    return;
  }

  const payload = {
    vodId: form.vodId,
    title: form.title.trim(),
    subTitle: form.subTitle.trim(),
    bgImage: form.bgImage.trim(),
    remarks: form.remarks.trim(),
    isShow: form.isShow,
    startAt: toIso(form.startAt),
    endAt: toIso(form.endAt),
  };

  saving.value = true;
  try {
    if (editingId.value !== '') {
      await api.put(`/home-hero/${editingId.value}`, payload);
      ElMessage.success('已保存');
    } else {
      await api.post('/home-hero', payload);
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleShow(row: HeroRow) {
  const next = row.isShow === 1 ? 0 : 1;
  try {
    await api.put(`/home-hero/${row.id}`, { isShow: next });
    ElMessage.success(next === 1 ? '已设为显示' : '已隐藏');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

/**
 * 上移/下移：把整列的 sort 重排成 10/20/30…，只提交真正变了的那几行。
 * hero 位最多 8 个，几次 PUT 可以接受，比维护「相邻差值」稳。
 */
async function move(row: HeroRow, delta: -1 | 1) {
  const list = [...items.value];
  const index = list.findIndex((item) => item.id === row.id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;

  const current = list[index];
  if (!current) return;
  list.splice(index, 1);
  list.splice(target, 0, current);
  const changed = list
    .map((item, i) => ({ id: item.id, sort: (i + 1) * 10, before: item.sort }))
    .filter((item) => item.sort !== item.before);

  try {
    await Promise.all(changed.map((item) => api.put(`/home-hero/${item.id}`, { sort: item.sort })));
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '排序失败');
  }
}

async function remove(row: HeroRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.vodName}」这个轮播位吗？`, '确认删除', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/home-hero/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

/** 时间窗口的「为什么不显示」，让人一眼看出是没到时间还是过期了 */
function stateOf(row: HeroRow): { text: string; type: 'success' | 'info' | 'warning' } {
  if (row.isShow !== 1) return { text: '已隐藏', type: 'info' };
  if (row.live) return { text: '在播', type: 'success' };
  const now = Date.now();
  const start = row.startAt ? new Date(row.startAt).getTime() : 0;
  const end = row.endAt ? new Date(row.endAt).getTime() : 0;
  if (start && start > now) return { text: '未到时间', type: 'warning' };
  if (end && end <= now) return { text: '已过期', type: 'info' };
  return { text: '未知', type: 'info' };
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <span class="hint">
          首页 hero 轮播位：最多 {{ MAX_HERO }} 个，按排序从小到大轮播；一个都没配（或都不在时间窗口内）时，首页回落到「今日更新」前 8 部。
        </span>
        <div class="actions">
          <el-button type="primary" :disabled="!canCreate" @click="openCreate">新增轮播位</el-button>
          <el-button :loading="loading" @click="load">刷新</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="items" row-key="id" style="width: 100%">
        <el-table-column label="排序" width="96">
          <template #default="{ row, $index }">
            <div class="sort-cell">
              <el-button
                text
                size="small"
                :disabled="$index === 0"
                @click="move(row, -1)"
              >
                ↑
              </el-button>
              <el-button
                text
                size="small"
                :disabled="$index === items.length - 1"
                @click="move(row, 1)"
              >
                ↓
              </el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="影片" min-width="260">
          <template #default="{ row }">
            <div class="vod-cell">
              <img v-if="row.vodCover" :src="row.vodCover" class="cover" alt="" />
              <div class="vod-text">
                <div class="title">
                  {{ row.vodName }}
                  <el-tag v-if="row.title" size="small" type="warning">已改标题</el-tag>
                </div>
                <div class="sub">
                  {{ [row.categoryName, row.vodYear || '', row.vodRemarks].filter(Boolean).join(' · ') }}
                </div>
                <div v-if="row.title || row.remarks || row.bgImage" class="overrides">
                  <span v-if="row.title">标题：{{ row.title }}</span>
                  <span v-if="row.remarks">角标：{{ row.remarks }}</span>
                  <span v-if="row.bgImage">自定义横幅</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="stateOf(row).type" size="small">{{ stateOf(row).text }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="上线 / 下线" width="200">
          <template #default="{ row }">
            <div class="time-cell">
              <span>{{ row.startAt ? formatDateTime(row.startAt) : '立即' }}</span>
              <span class="sep">→</span>
              <span>{{ row.endAt ? formatDateTime(row.endAt) : '长期' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text size="small" @click="toggleShow(row)">
              {{ row.isShow === 1 ? '隐藏' : '显示' }}
            </el-button>
            <el-button text size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <span class="empty">还没有配置轮播位，首页正在用「今日更新」前 8 部兜底。</span>
        </template>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" destroy-on-close>
      <el-form label-width="96px" label-position="right">
        <el-form-item label="影片" required>
          <el-select
            v-model="form.vodId"
            filterable
            remote
            :remote-method="searchVod"
            :loading="vodSearching"
            placeholder="输入片名搜索"
            style="width: 100%"
          >
            <el-option
              v-for="option in vodOptions"
              :key="option.id"
              :label="`${option.name}${option.year ? ` (${option.year})` : ''}`"
              :value="option.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="显示标题">
          <el-input v-model="form.title" placeholder="留空用影片名" maxlength="255" show-word-limit />
        </el-form-item>

        <el-form-item label="副标题">
          <el-input
            v-model="form.subTitle"
            placeholder="留空不显示（当前前台 hero 暂不展示副标题）"
            maxlength="255"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="横幅图">
          <el-input
            v-model="form.bgImage"
            placeholder="留空用影片封面；建议 16:9 或更宽的图"
            maxlength="1000"
          />
        </el-form-item>

        <el-form-item label="角标">
          <el-input v-model="form.remarks" placeholder="留空用影片备注" maxlength="255" />
        </el-form-item>

        <el-form-item label="定时上线">
          <el-date-picker
            v-model="form.startAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="留空表示立即"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="定时下线">
          <el-date-picker
            v-model="form.endAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="留空表示长期"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="显示">
          <el-switch v-model="form.isShow" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.search-bar .hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.search-bar .actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.sort-cell {
  display: flex;
  gap: 2px;
}

.vod-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}

.vod-cell .cover {
  width: 36px;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
  flex: none;
}

.vod-cell .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.vod-cell .sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.vod-cell .overrides {
  display: flex;
  gap: 12px;
  margin-top: 2px;
  color: var(--el-color-warning);
  font-size: 12px;
}

.time-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.time-cell .sep {
  display: none;
}

.empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
