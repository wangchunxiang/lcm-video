import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DashboardSummaryVO {
  vod: { total: number; enabled: number; disabled: number; today: number };
  play: { total: number };
  category: { total: number };
  source: { total: number; enabled: number };
  task: { total: number; enabled: number };
  todayLog: { runs: number; inserted: number; updated: number; failed: number };
  recentLogs: Array<{
    id: number;
    taskName: string;
    sourceName: string;
    status: number;
    total: number;
    inserted: number;
    updated: number;
    failed: number;
    startedAt: string;
    finishedAt: string | null;
  }>;
  recentVods: Array<{ id: number; name: string; status: number; collectedAt: string }>;
}

/** 首页一次取完所有统计：单个接口，避免后台首屏发七八个请求 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<DashboardSummaryVO> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      vodTotal,
      vodEnabled,
      vodToday,
      playTotal,
      categoryTotal,
      sourceTotal,
      sourceEnabled,
      taskTotal,
      taskEnabled,
      todayLog,
      recentLogs,
      recentVods,
    ] = await Promise.all([
      this.prisma.vod.count(),
      this.prisma.vod.count({ where: { status: 1 } }),
      this.prisma.vod.count({ where: { collectedAt: { gte: todayStart } } }),
      this.prisma.vodPlay.count(),
      this.prisma.category.count(),
      this.prisma.collectSource.count(),
      this.prisma.collectSource.count({ where: { isEnabled: 1 } }),
      this.prisma.collectTask.count(),
      this.prisma.collectTask.count({ where: { isEnabled: 1 } }),
      this.prisma.collectTaskLog.aggregate({
        where: { startedAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { inserted: true, updated: true, failed: true },
      }),
      this.prisma.collectTaskLog.findMany({
        orderBy: { id: 'desc' },
        take: 8,
        select: {
          id: true,
          taskId: true,
          taskName: true,
          sourceId: true,
          status: true,
          total: true,
          inserted: true,
          updated: true,
          failed: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      this.prisma.vod.findMany({
        orderBy: { id: 'desc' },
        take: 8,
        select: { id: true, name: true, status: true, collectedAt: true },
      }),
    ]);

    // 没有物理外键也没有 relation，源名单独查一次（最多 8 个）
    const sourceIds = [...new Set(recentLogs.map((row) => row.sourceId))];
    const sources = sourceIds.length
      ? await this.prisma.collectSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceName = new Map(sources.map((row) => [row.id, row.name]));

    return {
      vod: {
        total: vodTotal,
        enabled: vodEnabled,
        disabled: vodTotal - vodEnabled,
        today: vodToday,
      },
      play: { total: playTotal },
      category: { total: categoryTotal },
      source: { total: sourceTotal, enabled: sourceEnabled },
      task: { total: taskTotal, enabled: taskEnabled },
      todayLog: {
        runs: todayLog._count._all,
        inserted: todayLog._sum.inserted ?? 0,
        updated: todayLog._sum.updated ?? 0,
        failed: todayLog._sum.failed ?? 0,
      },
      recentLogs: recentLogs.map((row) => ({
        id: row.id,
        // 任务被删后记录还在，taskName 有快照列，直接用
        taskName: row.taskName || (row.taskId === 0 ? '手动采集' : `任务 #${row.taskId}`),
        sourceName: sourceName.get(row.sourceId) ?? `源站 #${row.sourceId}`,
        status: row.status,
        total: row.total,
        inserted: row.inserted,
        updated: row.updated,
        failed: row.failed,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      })),
      recentVods: recentVods.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        collectedAt: row.collectedAt.toISOString(),
      })),
    };
  }
}
