import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SettingDTO, SettingUpdateDTO, SettingVO } from './dto/setting';

interface SettingCache {
  at: number;
  rows: Map<string, string>;
}

const CACHE_TTL_MS = 60_000;

/**
 * 站点配置。底层是 KV 表 lcm_setting（列名 name，Prisma 里叫 key），
 * 读取走进程内缓存（60 秒），任何写入立刻失效（决策 3.7）。
 */
@Injectable()
export class SettingService {
  private cache: SettingCache | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<SettingVO[]> {
    const rows = await this.load();
    return [...rows.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }

  async get(dto: SettingDTO): Promise<SettingVO> {
    const rows = await this.load();
    const value = rows.get(dto.name);
    if (value === undefined) throw new NotFoundException(`配置 ${dto.name} 不存在`);
    return { name: dto.name, value };
  }

  /** 读一个数字配置，缺失或不是数字时用兜底值。 */
  async number(name: string, fallback: number): Promise<number> {
    const rows = await this.load();
    const raw = rows.get(name);
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  async update(dto: SettingUpdateDTO): Promise<SettingVO> {
    await this.prisma.setting.upsert({
      where: { key: dto.name },
      create: { key: dto.name, value: dto.value },
      update: { value: dto.value },
    });
    this.cache = null;
    return { name: dto.name, value: dto.value };
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache !== null && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.rows;
    }
    const records = await this.prisma.setting.findMany();
    const rows = new Map<string, string>();
    for (const record of records) rows.set(record.key, record.value ?? '');
    if (rows.size === 0) throw new BadRequestException('配置表为空');
    this.cache = { at: Date.now(), rows };
    return rows;
  }
}
