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

const sources = ref<SourceOption[]>([]);

const replaceForm = reactive({ from: '', to: '' });
const deleteForm = reactive<{ source_id: number | null }>({ source_id: null });
const cleanForm = reactive({ mode: 'offline' });

const busy = reactive({ replace: false, removeSource: false, clean: false });

async function loadSources(): Promise<void> {
  try {
    const result = await api.get<{ items: SourceOption[] }>('/sources', { page: 1, page_size: 100 });
    sources.value = result.items.map((item) => ({ id: item.id, name: item.name }));
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function runReplace(): Promise<void> {
  if (!replaceForm.from.trim()) {
    ElMessage.warning('请填写要查找的地址前缀');
    return;
  }
  if (replaceForm.from === replaceForm.to) {
    ElMessage.warning('替换前后的内容不能相同');
    return;
  }
  busy.replace = true;
  try {
    const preview = await api.post<NeedConfirm | Done>('/tools/replace-play-url', {
      from: replaceForm.from.trim(),
      to: replaceForm.to.trim(),
    });
    if ('needConfirm' in preview) {
      if (preview.total === 0) {
        ElMessage.info('没有线路命中该前缀');
        return;
      }
      await ElMessageBox.confirm(
        `将影响 ${preview.total} 条线路的播放地址，替换后无法自动还原，确认执行？`,
        '确认替换',
        { type: 'warning', confirmButtonText: '确认替换', cancelButtonText: '取消' },
      );
      const done = await api.post<Done>('/tools/replace-play-url', {
        from: replaceForm.from.trim(),
        to: replaceForm.to.trim(),
        confirm: true,
      });
      ElMessage.success(`已替换 ${done.affected} 条线路`);
    }
  } catch (error) {
    if (error !== 'cancel') ElMessage.error((error as Error).message);
  } finally {
    busy.replace = false;
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
        ElMessage.info('没有无线路的在架影片');
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

onMounted(loadSources);
</script>

<template>
  <div class="tools">
    <el-card shadow="never">
      <template #header><span>批量替换播放地址</span></template>
      <p class="tip">把全站播放地址中出现的旧前缀替换为新前缀，例如源站换了 CDN 域名。</p>
      <el-form inline>
        <el-form-item label="查找">
          <el-input v-model="replaceForm.from" placeholder="http://old.example.com" style="width: 280px" />
        </el-form-item>
        <el-form-item label="替换为">
          <el-input v-model="replaceForm.to" placeholder="http://new.example.com" style="width: 280px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="busy.replace" @click="runReplace">执行替换</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header><span>批量删除某源线路</span></template>
      <p class="tip">删除某个采集源写入的全部线路，手工添加的线路不受影响。失去全部线路的影片会自动下架。</p>
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
</style>
