<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';

interface LogRow {
  id: number;
  taskName: string | null;
  sourceName: string | null;
  status: number;
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

interface VodRow {
  id: number;
  name: string;
  status: number;
  collectedAt: string | null;
}

interface DashboardData {
  vod: { total: number; enabled: number; disabled: number; today: number };
  play: { total: number };
  category: { total: number };
  source: { total: number; enabled: number };
  task: { total: number; enabled: number };
  todayLog: { runs: number; inserted: number; updated: number; failed: number };
  recentLogs: LogRow[];
  recentVods: VodRow[];
}

const loading = ref(false);
const data = ref<DashboardData | null>(null);

const statusText = (status: number): string => {
  if (status === 0) return '进行中';
  if (status === 1) return '成功';
  if (status === 3) return '已取消';
  return '失败';
};

const statusType = (status: number): 'success' | 'warning' | 'danger' | 'info' => {
  if (status === 1) return 'success';
  if (status === 0) return 'warning';
  if (status === 3) return 'info';
  return 'danger';
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await api.get<DashboardData>('/dashboard');
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <el-row :gutter="16">
      <el-col :span="6">
        <el-card shadow="never" class="stat">
          <div class="stat-label">影片总数</div>
          <div class="stat-value">{{ data?.vod.total ?? 0 }}</div>
          <div class="stat-sub">在架 {{ data?.vod.enabled ?? 0 }} · 下架 {{ data?.vod.disabled ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat">
          <div class="stat-label">线路总数</div>
          <div class="stat-value">{{ data?.play.total ?? 0 }}</div>
          <div class="stat-sub">分类 {{ data?.category.total ?? 0 }} 个</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat">
          <div class="stat-label">采集源站</div>
          <div class="stat-value">{{ data?.source.total ?? 0 }}</div>
          <div class="stat-sub">启用 {{ data?.source.enabled ?? 0 }} · 任务 {{ data?.task.total ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat">
          <div class="stat-label">今日采集</div>
          <div class="stat-value">{{ data?.todayLog.inserted ?? 0 }}</div>
          <div class="stat-sub">
            新增 {{ data?.todayLog.inserted ?? 0 }} · 更新 {{ data?.todayLog.updated ?? 0 }} · 失败
            {{ data?.todayLog.failed ?? 0 }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>最近采集</span>
              <el-button link type="primary" @click="load">刷新</el-button>
            </div>
          </template>
          <el-table :data="data?.recentLogs ?? []" size="small" empty-text="还没有采集记录">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="taskName" label="任务" min-width="120" show-overflow-tooltip />
            <el-table-column prop="sourceName" label="源站" width="100" show-overflow-tooltip />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="inserted" label="新增" width="70" />
            <el-table-column prop="updated" label="更新" width="70" />
            <el-table-column prop="failed" label="失败" width="70" />
            <el-table-column label="开始时间" width="160">
              <template #default="{ row }">{{ row.startedAt ?? '—' }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>最近入库</span>
            </div>
          </template>
          <el-table :data="data?.recentVods ?? []" size="small" empty-text="还没有影片">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="片名" min-width="140" show-overflow-tooltip />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">
                  {{ row.status === 1 ? '在架' : '下架' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stat-label {
  font-size: 13px;
  color: #909399;
}
.stat-value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 600;
  color: #303133;
}
.stat-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #a8abb2;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
