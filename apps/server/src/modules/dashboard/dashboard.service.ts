import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** 首页概览：一次返回所有卡片需要的数据。 */
export interface DashboardSummary {
  vod: { total: number; enabled: number; disabled: number; today: number };
  play: { total: number };
  category: { total: number };
  source: { total: number; enabled: number };
  task: { total: number; enabled: number };
  todayLog: { runs: number; inserted: number; updated: number; failed: number };
  recentLogs: Array<{
    id: string;
    taskName: string;
    sourceName: string;
    status: number;
    inserted: number;
    updated: number;
    failed: number;
    startedAt: Date | null;
  }>;
  recentVods: Array<{
    id: string;
    name: string;
    cover: string;
    year: number;
    collectedAt: Date;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async summary(): Promise<DashboardSummary> {
    const [vodCounts] = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT COUNT(*) AS total,
              SUM(status = 1) AS enabled,
              SUM(status = 0) AS disabled,
              SUM(created_at >= CURDATE()) AS today
         FROM lcm_vod`,
    );
    const [playCount] = await this.dataSource.query<Array<{ total: string }>>(
      'SELECT COUNT(*) AS total FROM lcm_vod_play',
    );
    const [categoryCount] = await this.dataSource.query<Array<{ total: string }>>(
      'SELECT COUNT(*) AS total FROM lcm_category',
    );
    const [sourceCount] = await this.dataSource.query<Array<Record<string, string>>>(
      'SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled FROM lcm_collect_source',
    );
    const [taskCount] = await this.dataSource.query<Array<Record<string, string>>>(
      'SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled FROM lcm_collect_task',
    );
    const [todayLog] = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT COUNT(*) AS runs,
              COALESCE(SUM(inserted), 0) AS inserted,
              COALESCE(SUM(updated), 0) AS updated,
              COALESCE(SUM(failed), 0) AS failed
         FROM lcm_collect_task_log
        WHERE started_at >= CURDATE()`,
    );

    const recentLogs = await this.dataSource.query<
      Array<{
        id: string;
        taskName: string;
        sourceId: string;
        status: number;
        inserted: number;
        updated: number;
        failed: number;
        startedAt: Date | null;
      }>
    >(
      `SELECT id, task_name AS taskName, source_id AS sourceId, status,
              inserted, updated, failed, started_at AS startedAt
         FROM lcm_collect_task_log
        ORDER BY id DESC LIMIT 8`,
    );
    const sourceNames = await this.sourceNameMap(recentLogs.map((item) => item.sourceId));

    const recentVods = await this.dataSource.query<
      Array<{ id: string; name: string; cover: string; year: number; collectedAt: Date }>
    >('SELECT id, name, cover, year, collected_at AS collectedAt FROM lcm_vod ORDER BY id DESC LIMIT 8');

    return {
      vod: {
        total: Number(vodCounts?.total ?? 0),
        enabled: Number(vodCounts?.enabled ?? 0),
        disabled: Number(vodCounts?.disabled ?? 0),
        today: Number(vodCounts?.today ?? 0),
      },
      play: { total: Number(playCount?.total ?? 0) },
      category: { total: Number(categoryCount?.total ?? 0) },
      source: {
        total: Number(sourceCount?.total ?? 0),
        enabled: Number(sourceCount?.enabled ?? 0),
      },
      task: { total: Number(taskCount?.total ?? 0), enabled: Number(taskCount?.enabled ?? 0) },
      todayLog: {
        runs: Number(todayLog?.runs ?? 0),
        inserted: Number(todayLog?.inserted ?? 0),
        updated: Number(todayLog?.updated ?? 0),
        failed: Number(todayLog?.failed ?? 0),
      },
      recentLogs: recentLogs.map((item) => ({
        id: item.id,
        taskName: item.taskName,
        sourceName: sourceNames.get(item.sourceId) ?? '',
        status: item.status,
        inserted: item.inserted,
        updated: item.updated,
        failed: item.failed,
        startedAt: item.startedAt,
      })),
      recentVods,
    };
  }

  private async sourceNameMap(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)].filter((id) => id !== '' && id !== '0');
    if (unique.length === 0) return new Map();
    const rows = await this.dataSource.query<Array<{ id: string; name: string }>>(
      'SELECT id, name FROM lcm_collect_source WHERE id IN (?)',
      [unique],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
