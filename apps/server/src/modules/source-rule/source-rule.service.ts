import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { applyCoverRules, applyPlayUrlRules, hostOf, splitUrlPatterns, urlRuleNeedles } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { SourceRuleEntity } from './source-rule.entity';
import type { CreateSourceRuleDTO, UpdateSourceRuleDTO } from './dto/source-rule.dto';

/** 重刷结果，`needConfirm=true` 时只统计不落库。 */
export interface SourceRuleApplyResult {
  needConfirm: boolean;
  total: number;
  affected: number;
}

/** 线下重刷按批提交，避免单条 UPDATE 撑爆 max_allowed_packet。 */
const APPLY_BATCH = 100;

/** 原地址统一成「一行一条」：去空行、去重复、去首尾空格，存库与比较都按这个形式 */
function normalizeFromUrl(value: string): string {
  const patterns = splitUrlPatterns(value);
  if (patterns.length === 0) throw new BadRequestException('原地址不能为空');
  return patterns.join('\n');
}

/** 新地址不能是原地址之一，否则规则自己转自己没意义 */
function assertNotSelf(fromUrl: string, toUrl: string): void {
  const target = urlRuleNeedles(toUrl)[0];
  if (target === undefined) return;
  if (urlRuleNeedles(fromUrl).includes(target)) {
    throw new BadRequestException('新地址不能与原地址相同');
  }
}

/** 重刷时的 LIKE 预筛条件，一条规则可能带多个原地址 */
function requireNeedles(rule: SourceRuleEntity): string[] {
  const needles = urlRuleNeedles(rule.fromUrl);
  if (needles.length === 0) throw new BadRequestException('原地址为空，无法重刷');
  return needles;
}

/** 地址替换规则：采集写库前套用，另提供对历史数据的重刷。 */
@Injectable()
export class SourceRuleService extends AppCrudService<SourceRuleEntity> {
  constructor(
    @InjectRepository(SourceRuleEntity) repository: Repository<SourceRuleEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  override async create(dto: CreateSourceRuleDTO): Promise<SourceRuleEntity> {
    await this.requireSource(dto.sourceId);
    const fromUrl = normalizeFromUrl(dto.fromUrl);
    const toUrl = (dto.toUrl ?? '').trim();
    assertNotSelf(fromUrl, toUrl);
    await this.assertNoOverlap(dto.sourceId, dto.kind, fromUrl);
    return super.create({ ...dto, fromUrl, toUrl });
  }

  override async update(id: string, dto: UpdateSourceRuleDTO): Promise<SourceRuleEntity> {
    const current = await this.repository.findOne({ where: { id } });
    if (current === null) throw new NotFoundException('规则不存在');

    const sourceId = dto.sourceId ?? current.sourceId;
    const kind = dto.kind ?? current.kind;
    const fromUrl = dto.fromUrl === undefined ? current.fromUrl : normalizeFromUrl(dto.fromUrl);
    const toUrl = dto.toUrl === undefined ? current.toUrl : dto.toUrl.trim();
    assertNotSelf(fromUrl, toUrl);
    if (sourceId !== current.sourceId) await this.requireSource(sourceId);
    if (sourceId !== current.sourceId || kind !== current.kind || fromUrl !== current.fromUrl) {
      await this.assertNoOverlap(sourceId, kind, fromUrl, id);
    }
    return super.update(id, { ...dto, fromUrl, toUrl });
  }

  /**
   * 把规则套用到已有数据：kind=2 改影片封面，kind=1 只改本采集源的线路。
   * `confirm=false` 时只返回影响条数，供后台二次确认。
   */
  async apply(id: string, confirm: boolean): Promise<SourceRuleApplyResult> {
    const rule = await this.repository.findOne({ where: { id } });
    if (rule === null) throw new NotFoundException('规则不存在');
    if (rule.isEnabled !== 1) throw new BadRequestException('规则已停用，先启用再重刷');
    return rule.kind === 2 ? this.applyCover(rule, confirm) : this.applyPlay(rule, confirm);
  }

  /** 封面替换：`cover_host` 是业务列，必须跟着重算。 */
  private async applyCover(
    rule: SourceRuleEntity,
    confirm: boolean,
  ): Promise<SourceRuleApplyResult> {
    const needles = requireNeedles(rule);
    const params = needles.map((needle) => `%${needle}%`);
    const rows = await this.dataSource.query<Array<{ id: string; cover: string }>>(
      `SELECT id, cover FROM lcm_vod WHERE ${needles.map(() => 'cover LIKE ?').join(' OR ')}`,
      params,
    );
    const changes: Array<{ id: string; cover: string; coverHost: string }> = [];
    for (const row of rows) {
      const cover = applyCoverRules(row.cover, [rule]);
      if (cover !== row.cover) changes.push({ id: row.id, cover, coverHost: hostOf(cover) });
    }
    if (!confirm) return { needConfirm: true, total: changes.length, affected: 0 };
    if (changes.length === 0) return { needConfirm: false, total: 0, affected: 0 };

    let affected = 0;
    for (let start = 0; start < changes.length; start += APPLY_BATCH) {
      const batch = changes.slice(start, start + APPLY_BATCH);
      const coverCases = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const hostCases = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const params: string[] = [];
      for (const row of batch) params.push(row.id, row.cover);
      for (const row of batch) params.push(row.id, row.coverHost);
      const ids = batch.map((row) => row.id);
      await this.dataSource.query(
        `UPDATE lcm_vod
            SET cover = CASE id ${coverCases} ELSE cover END,
                cover_host = CASE id ${hostCases} ELSE cover_host END,
                updated_at = ?
          WHERE id IN (?)`,
        [...params, new Date(), ids],
      );
      affected += batch.length;
    }
    return { needConfirm: false, total: changes.length, affected };
  }

  /** 播放地址换前缀：只动本采集源的线路，逐集套用规则。 */
  private async applyPlay(
    rule: SourceRuleEntity,
    confirm: boolean,
  ): Promise<SourceRuleApplyResult> {
    const needles = requireNeedles(rule);
    const params = [rule.sourceId, ...needles.map((needle) => `%${needle}%`)];
    const rows = await this.dataSource.query<Array<{ id: string; playUrl: string }>>(
      `SELECT id, play_url AS playUrl FROM lcm_vod_play
        WHERE source_id = ? AND (${needles.map(() => 'play_url LIKE ?').join(' OR ')})`,
      params,
    );
    const changes: Array<{ id: string; playUrl: string }> = [];
    for (const row of rows) {
      const next = applyPlayUrlRules(row.playUrl, [rule]);
      if (next !== row.playUrl) changes.push({ id: row.id, playUrl: next });
    }
    if (!confirm) return { needConfirm: true, total: changes.length, affected: 0 };
    if (changes.length === 0) return { needConfirm: false, total: 0, affected: 0 };

    let affected = 0;
    for (let start = 0; start < changes.length; start += APPLY_BATCH) {
      const batch = changes.slice(start, start + APPLY_BATCH);
      const cases = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const params: string[] = [];
      for (const row of batch) params.push(row.id, row.playUrl);
      const ids = batch.map((row) => row.id);
      await this.dataSource.query(
        `UPDATE lcm_vod_play
            SET play_url = CASE id ${cases} ELSE play_url END,
                updated_at = ?
          WHERE id IN (?)`,
        [...params, new Date(), ids],
      );
      affected += batch.length;
    }
    return { needConfirm: false, total: changes.length, affected };
  }

  private async requireSource(sourceId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM lcm_collect_source WHERE id = ? LIMIT 1',
      [sourceId],
    );
    if (rows.length === 0) throw new NotFoundException('采集源不存在');
  }

  /**
   * 同一采集源 + 同一类型下，一个原地址只能出现在一条规则里，否则重刷时谁先套谁不确定。
   * 原地址是多行文本，没法再用唯一索引兜底（文本列无法做全列索引），改在服务层比对。
   */
  private async assertNoOverlap(
    sourceId: string,
    kind: number,
    fromUrl: string,
    excludeId?: string,
  ): Promise<void> {
    const params: string[] = [sourceId, String(kind)];
    let sql = 'SELECT id, from_url AS fromUrl FROM lcm_source_rule WHERE source_id = ? AND kind = ?';
    if (excludeId !== undefined) {
      sql += ' AND id <> ?';
      params.push(excludeId);
    }
    const rows = await this.dataSource.query<Array<{ id: string; fromUrl: string }>>(sql, params);
    const mine = urlRuleNeedles(fromUrl);
    for (const row of rows) {
      const others = urlRuleNeedles(row.fromUrl ?? '');
      const duplicated = mine.find((needle) => others.includes(needle));
      if (duplicated !== undefined) {
        throw new BadRequestException(`原地址「${duplicated}」已被规则 #${row.id} 使用`);
      }
    }
  }
}
