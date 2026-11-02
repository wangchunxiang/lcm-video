<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface SourceOption {
  id: number;
  name: string;
}

type NeedConfirm = { needConfirm: true; total: number; mode?: string };
type Done = { affected: number; offline?: number; mode?: string };

/** 数据一致性巡检结果，字段为 0 表示该表没有孤儿行 */
interface IntegrityReport {
  playsWithoutVod: number;
  playsWithoutSource: number;
  mappingsWithoutSource: number;
  mappingsWithoutCategory: number;
  tasksWithoutSource: number;
  adFeaturesWithoutSource: number;
  emptyVods: number;
}

const INTEGRITY_LABELS: Array<{ key: keyof IntegrityReport; label: string }> = [
  { key: 'playsWithoutVod', label: '线路指向的影片不存在' },
  { key: 'playsWithoutSource', label: '线路指向的采集源不存在' },
  { key: 'mappingsWithoutSource', label: '分类映射指向的采集源不存在' },
  { key: 'mappingsWithoutCategory', label: '分类映射指向的分类不存在' },
  { key: 'tasksWithoutSource', label: '采集任务指向的采集源不存在' },
  { key: 'adFeaturesWithoutSource', label: '广告特征指向的采集源不存在' },
  { key: 'emptyVods', label: '在架但没有任何线路的影片' },
];

const sources = ref<SourceOption[]>([]);
const integrity = ref<IntegrityReport | null>(null);

const replaceForm = reactive<{ source_id: number; from: string; to: string }>({
  source_id: 0,
  from: '',
  to: '',
});
const coverForm = reactive<{ from: string; to: string }>({
  from: '',
  to: '',
});
const deleteForm = reactive<{ source_id: number | null }>({ source_id: null });
const cleanForm = reactive({ mode: 'offline' });

const busy = reactive({ replace: false, cover: false, removeSource: false, clean: false, integrity: false });

/** 只读巡检，不清数据 */
async function loadIntegrity(): Promise<void> {
  busy.integrity = true;
  try {
    integrity.value = await api.get<IntegrityReport>('/tools/integrity');
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    busy.integrity = false;
  }
}

/** 清理孤儿行：线路、映射、任务、广告特征、封面体检结果 */
async function cleanIntegrity(): Promise<void> {
  const report = integrity.value;
  const total = report
    ? INTEGRITY_LABELS.filter((item) => item.key !== 'emptyVods').reduce((sum, item) => sum + report[item.key], 0)
    : 0;
  if (total === 0) {
    ElMessage.info('没有需要清理的孤儿数据');
    return;
  }
  try {
    await ElMessageBox.confirm(`将删除 ${total} 条孤儿数据，删除后不可恢复。`, '清理孤儿数据', {
      type: 'warning',
      confirmButtonText: '确认清理',
    });
  } catch {
    return;
  }
  busy.integrity = true;
  try {
    const result = await api.post<Record<string, number>>('/tools/integrity/clean');
    const affected = Object.values(result).reduce((sum, value) => sum + Number(value || 0), 0);
    ElMessage.success(`已清理 ${affected} 条孤儿数据`);
    await loadIntegrity();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    busy.integrity = false;
  }
}

async function loadSources(): Promise<void> {
  try {
    const result = await api.get<{ items: SourceOption[] }>('/sources', { page: 1, page_size: 100 });
    sources.value = result.items.map((item) => ({ id: item.id, name: item.name }));
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function sourceLabel(id: number): string {
  if (id <= 0) return '全部采集源';
  return sources.value.find((item) => item.id === id)?.name ?? '全部采集源';
}

/**
 * 播放地址与图片地址的批量替换流程完全一样：先预览命中数量，再二次确认执行。
 * path 是接口前缀，unit 是提示里的计量单位。
 */
async function runReplace(
  kind: 'replace' | 'cover',
  form: { source_id?: number; from: string; to: string },
  path: string,
  unit: string,
): Promise<void> {
  if (!form.from.trim()) {
    ElMessage.warning('请填写要查找的地址前缀');
    return;
  }
  if (form.from.trim() === form.to.trim()) {
    ElMessage.warning('替换前后的内容不能相同');
    return;
  }
  busy[kind] = true;
  try {
    const payload: Record<string, unknown> = {
      from: form.from.trim(),
      to: form.to.trim(),
    };
    // 播放地址挂在「源 + 线路」上，可以按源限定；封面在影片上，没有源的概念
    if (kind === 'replace') payload.source_id = form.source_id ?? 0;
    const preview = await api.post<NeedConfirm | Done>(path, payload);
    if (!('needConfirm' in preview)) return;
    if (preview.total === 0) {
      ElMessage.info(`没有${unit}命中该前缀`);
      return;
    }
    await ElMessageBox.confirm(
      kind === 'replace'
        ? `「${sourceLabel(form.source_id ?? 0)}」将影响 ${preview.total} 个${unit}，替换后无法自动还原，确认执行？`
        : `将影响 ${preview.total} 个${unit}，替换后无法自动还原，确认执行？`,
      '确认替换',
      { type: 'warning', confirmButtonText: '确认替换', cancelButtonText: '取消' },
    );
    const done = await api.post<Done>(path, { ...payload, confirm: true });
    ElMessage.success(`已替换 ${done.affected} 个${unit}`);
  } catch (error) {
    if (error !== 'cancel') ElMessage.error((error as Error).message);
  } finally {
    busy[kind] = false;
  }
}

async function runDeleteSource(): Promise<void> {
  if (deleteForm.source_id === null) {
    ElMessage.warning('请选择采集源');
    return;
  }
  busy.removeSource = true;
  try {
    const preview = await api.post<NeedConfirm | Done>('/tools/delete-source-plays', {
      source_id: deleteForm.source_id,
    });
    if ('needConfirm' in preview) {
      if (preview.total === 0) {
        ElMessage.info('该源下没有线路');
        return;
      }
      await ElMessageBox.confirm(
        `将删除该源的 ${preview.total} 条线路（手工线路不受影响），没有线路的影片会自动下架。确认执行？`,
        '确认删除',
        { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
      );
      const done = await api.post<Done>('/tools/delete-source-plays', {
        source_id: deleteForm.source_id,
        confirm: true,
      });
      ElMessage.success(`已删除 ${done.affected} 条线路，${done.offline ?? 0} 部影片已下架`);
    }
  } catch (error) {
    if (error !== 'cancel') ElMessage.error((error as Error).message);
  } finally {
    busy.removeSource = false;
  }
}

async function runClean(): Promise<void> {
  busy.clean = true;
  try {
    const preview = await api.post<NeedConfirm | Done>('/tools/clean-vods', { mode: cleanForm.mode });
    if ('needConfirm' in preview) {
      if (preview.total === 0) {
        ElMessage.info('没有无线路的影片');
        return;
      }
      const action = cleanForm.mode === 'delete' ? '删除' : '下架';
      await ElMessageBox.confirm(
        `将${action} ${preview.total} 部没有线路的在架影片，确认执行？`,
        `确认${action}`,
        { type: 'warning', confirmButtonText: `确认${action}`, cancelButtonText: '取消' },
      );
      const done = await api.post<Done>('/tools/clean-vods', { mode: cleanForm.mode, confirm: true });
      ElMessage.success(`已处理 ${done.affected} 部影片`);
    }
  } catch (error) {
    if (error !== 'cancel') ElMessage.error((error as Error).message);
  } finally {
    busy.clean = false;
  }
}

onMounted(() => {
  void loadSources();
  void loadIntegrity();
});
</script>

<template>
  <div class="tools">
    <el-card shadow="never">
      <template #header><span>批量替换播放地址</span></template>
      <p class="tip">
        把播放地址中出现的旧前缀替换为新前缀，例如源站换了 CDN 域名。可限定只处理某个采集源的线路。
      </p>
      <el-form inline>
        <el-form-item label="采集源">
          <el-select v-model="replaceForm.source_id" style="width: 200px">
            <el-option label="全部采集源" :value="0" />
            <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="查找">
          <el-input v-model="replaceForm.from" placeholder="http://old.example.com" style="width: 260px" />
        </el-form-item>
        <el-form-item label="替换为">
          <el-input v-model="replaceForm.to" placeholder="http://new.example.com" style="width: 260px" />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="busy.replace"
            @click="runReplace('replace', replaceForm, '/tools/replace-play-url', '线路')"
          >
            执行替换
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header><span>批量替换图片地址</span></template>
      <p class="tip">
        把影片封面地址中出现的旧前缀替换为新前缀，例如图床换了域名。封面存在影片上，同一部影片可能由多个源提供，因此不按采集源筛选，全站一起替换。
      </p>
      <el-form inline>
        <el-form-item label="查找">
          <el-input v-model="coverForm.from" placeholder="http://old.img.com" style="width: 260px" />
        </el-form-item>
        <el-form-item label="替换为">
          <el-input v-model="coverForm.to" placeholder="http://new.img.com" style="width: 260px" />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="busy.cover"
            @click="runReplace('cover', coverForm, '/tools/replace-cover-url', '影片')"
          >
            执行替换
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header><span>批量删除某源线路</span></template>
      <p class="tip">
        删除某个采集源写入的全部线路，手工添加的线路不受影响。失去全部线路的影片会自动下架。
      </p>
      <el-form inline>
        <el-form-item label="采集源">
          <el-select v-model="deleteForm.source_id" placeholder="选择采集源" style="width: 280px">
            <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="danger" :loading="busy.removeSource" @click="runDeleteSource">执行删除</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header><span>清理无线路影片</span></template>
      <p class="tip">处理在架但一条线路都没有的影片，默认下架保留数据，也可以直接删除。</p>
      <el-form inline>
        <el-form-item label="处理方式">
          <el-radio-group v-model="cleanForm.mode">
            <el-radio value="offline">下架</el-radio>
            <el-radio value="delete">删除</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="busy.clean" @click="runClean">执行清理</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header><span>数据一致性</span></template>
      <p class="tip">
        项目不使用数据库外键，删除源站、分类、影片时的级联都在代码里做。这里兜底检查残留的孤儿数据：指向已删除对象的线路、映射、任务、广告特征与封面体检结果。
      </p>
      <el-table v-if="integrity" :data="INTEGRITY_LABELS" size="small" style="margin-bottom: 12px">
        <el-table-column prop="label" label="检查项" min-width="260" />
        <el-table-column label="数量" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ danger: integrity[row.key] > 0 }">{{ integrity[row.key] }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-space>
        <el-button :loading="busy.integrity" @click="loadIntegrity">重新检查</el-button>
        <el-button type="danger" :loading="busy.integrity" @click="cleanIntegrity">清理孤儿数据</el-button>
      </el-space>
    </el-card>
  </div>
</template>

<style scoped>
.tools {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.tools :deep(.el-form--inline) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.tools :deep(.el-form--inline .el-form-item) {
  margin-right: 12px;
  margin-bottom: 0;
}
.tools :deep(.el-form--inline .el-form-item:last-child) {
  margin-right: 0;
}
.danger {
  color: var(--el-color-danger);
}
</style>
