import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { clearHostCovers, repairHostCovers, scanHost } from './repair';
import type { RepairItem, ScanResult } from './repair';
import { CoverCheckEntity } from './cover-check.entity';

/** 域名列表里的一行。 */
export interface CoverHostVO {
  host: string;
  vodCount: number;
  status: number;
  sampleOk: number;
  sampleFail: number;
  message: string;
  checkedAt: string;
}

/** 封面域名概览。 */
export interface CoverHostSummary {
  hosts: CoverHostVO[];
  summary: { hosts: number; ok: number; bad: number; unverified: number; unchecked: number };
}

const ALL_LIMIT = 1000;

/** 封面体检：标准 REST + 域名概览 / 扫描 / 清空 / 修复。 */
@Injectable()
export class CoverCheckService extends AppCrudService<CoverCheckEntity> {
  constructor(
    @InjectRepository(CoverCheckEntity) repository: Repository<CoverCheckEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  /** 域名列表：影片数实时从 lcm_vod 统计，体检结果取本表快照。 */
  async hosts(): Promise<CoverHostSummary> {
    const counted = await this.dataSource.query<Array<{ host: string; vodCount: number }>>(
      `SELECT cover_host AS host, COUNT(*) AS vodCount
         FROM lcm_vod
        WHERE cover_host <> ''
        GROUP BY cover_host
        ORDER BY vodCount DESC`,
    );
    const checks = await this.repository.find({ take: ALL_LIMIT });
    const checkMap = new Map(checks.map((row) => [row.host, row]));

    const hosts: CoverHostVO[] = [];
    const known = new Set(counted.map((row) => row.host));
    for (const row of counted) {
      const check = checkMap.get(row.host);
      hosts.push({
        host: row.host,
        vodCount: Number(row.vodCount),
        status: check?.status ?? 0,
        sampleOk: check?.sampleOk ?? 0,
        sampleFail: check?.sampleFail ?? 0,
        message: check?.message ?? '',
        checkedAt: check?.checkedAt === null || check?.checkedAt === undefined
          ? ''
          : check.checkedAt.toISOString(),
      });
    }
    /* 表里有、但已经没有影片归属的域名也列出来，方便清理陈旧记录 */
    for (const check of checks) {
      if (known.has(check.host)) continue;
      hosts.push({
        host: check.host,
        vodCount: 0,
        status: check.status,
        sampleOk: check.sampleOk,
        sampleFail: check.sampleFail,
        message: check.message,
        checkedAt: check.checkedAt === null ? '' : check.checkedAt.toISOString(),
      });
    }

    const summary = {
      hosts: hosts.length,
      ok: hosts.filter((row) => row.status === 1).length,
      bad: hosts.filter((row) => row.status === 2).length,
      unverified: hosts.filter((row) => row.status === 3).length,
      unchecked: hosts.filter((row) => row.status === 0).length,
    };
    return { hosts, summary };
  }

  /** 某个域名下的影片分页列表。 */
  async hostVods(
    host: string,
    take: number,
    skip: number,
  ): Promise<{ items: Array<{ id: string; name: string; cover: string }>; total: number }> {
    const items = await this.dataSource.query<
      Array<{ id: string; name: string; cover: string }>
    >(
      'SELECT id, name, cover FROM lcm_vod WHERE cover_host = ? ORDER BY id ASC LIMIT ? OFFSET ?',
      [host, take, skip],
    );
    const counted = await this.dataSource.query<Array<{ total: number }>>(
      'SELECT COUNT(*) AS total FROM lcm_vod WHERE cover_host = ?',
      [host],
    );
    return { items, total: Number(counted[0]?.total ?? 0) };
  }

  /** 抽查一个域名并把结果写入体检表。 */
  async scan(host: string): Promise<ScanResult> {
    const rows = await this.dataSource.query<Array<{ total: number }>>(
      'SELECT COUNT(*) AS total FROM lcm_vod WHERE cover_host = ?',
      [host],
    );
    return scanHost(this.dataSource, host, Number(rows[0]?.total ?? 0));
  }

  /** 清空一个域名下的全部封面。 */
  async clear(host: string): Promise<{ cleared: number }> {
    const cleared = await clearHostCovers(this.dataSource, host);
    return { cleared };
  }

  /** 尝试给失效封面的影片找替代图。 */
  async repair(
    host: string,
    limit: number,
  ): Promise<{ fixed: number; failed: number; remaining: number; scanned: number; items: RepairItem[] }> {
    const result = await repairHostCovers(this.dataSource, { host, limit });
    return { ...result, scanned: result.items.length };
  }

  /**
   * 只保留有影片归属的域名记录，清掉陈旧行。
   * 一条 `DELETE ... LEFT JOIN` 搞定：不再逐行 `SELECT COUNT(*)`（域名多了就是上千次往返），
   * 也不再受 `take: ALL_LIMIT` 截断（原来超过 1000 行的陈旧记录永远清不掉）。
   */
  async prune(): Promise<{ deleted: number }> {
    const result = await this.dataSource.query<{ affectedRows: number }>(
      `DELETE c FROM lcm_cover_check c
         LEFT JOIN (SELECT DISTINCT cover_host AS host FROM lcm_vod WHERE cover_host <> '') v
           ON v.host = c.host
        WHERE v.host IS NULL`,
    );
    return { deleted: result.affectedRows };
  }

  /** 校验入参 host 不为空。 */
  requireHost(host: string): string {
    const value = host.trim();
    if (value === '') throw new BadRequestException('域名不能为空');
    return value;
  }
}
