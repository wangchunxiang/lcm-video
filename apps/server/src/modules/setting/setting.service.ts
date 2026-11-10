import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { SettingEntity } from './setting.entity';

/** 进程内缓存时长：配置读多写少，60 秒足够，改动后立刻失效。 */
const CACHE_MS = 60_000;

/**
 * 站点配置（KV 表）。
 *
 * 全站到处都要读配置（播放器开关、分页条数、站点名），每个请求查一次库代价高，
 * 所以这里做 60 秒进程内缓存，任何写入都立即清空缓存。
 */
@Injectable()
export class SettingService extends AppCrudService<SettingEntity> {
  private cache: { at: number; value: Map<string, string> } | null = null;

  constructor(@InjectRepository(SettingEntity) repository: Repository<SettingEntity>) {
    super(repository);
  }

  /** 取全部配置为 `键 -> 值` 的映射。 */
  async map(): Promise<Record<string, string>> {
    const cached = this.cache;
    if (cached !== null && Date.now() - cached.at < CACHE_MS) {
      return Object.fromEntries(cached.value);
    }

    const rows = await this.repository.find();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value ?? '';
    }
    this.cache = { at: Date.now(), value: new Map(Object.entries(result)) };
    return result;
  }

  /** 取单个配置，不存在返回 `fallback`。 */
  async get(key: string, fallback = ''): Promise<string> {
    const all = await this.map();
    return all[key] ?? fallback;
  }

  /** 取数字配置，非法值回落默认。 */
  async number(key: string, fallback: number): Promise<number> {
    const raw = await this.get(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /** 取布尔配置：库里存 `'1'` / `'0'`。 */
  async flag(key: string, fallback: boolean): Promise<boolean> {
    const raw = await this.get(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  }

  /** 写入（存在则更新），写完清缓存。 */
  async save(key: string, value: string): Promise<SettingEntity> {
    const existing = await this.repository.findOne({ where: { key } });
    const row =
      existing === null
        ? await this.repository.save(this.repository.create({ key, value }))
        : await this.repository.save({ ...existing, value });
    this.cache = null;
    return row;
  }

  /** 批量写入，一个事务，写完清缓存。 */
  async saveMany(entries: Array<{ key: string; value: string }>): Promise<number> {
    for (const entry of entries) {
      await this.save(entry.key, entry.value);
    }
    this.cache = null;
    return entries.length;
  }

  /** 删除后清缓存。 */
  override async delete(
    criteria: string | FindOptionsWhere<SettingEntity>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    const result = await super.delete(criteria, softDelete);
    this.cache = null;
    return result;
  }
}
