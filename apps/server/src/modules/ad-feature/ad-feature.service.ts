import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { analyzeSource, pickSampleVods } from './analyze';
import type { FoundFeature, SampleVod } from './analyze';
import { AdFeatureEntity } from './ad-feature.entity';

/** 一次分析的结果。 */
export interface AdAnalyzeResult {
  sampled: number;
  features: FoundFeature[];
}

/** 广告特征：标准 REST + 抽样预览 / 分析（可流式）。 */
@Injectable()
export class AdFeatureService extends AppCrudService<AdFeatureEntity> {
  constructor(
    @InjectRepository(AdFeatureEntity) repository: Repository<AdFeatureEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  /** 预览这次会抽到哪几部作品。 */
  async pick(sourceId: string): Promise<SampleVod[]> {
    return pickSampleVods(this.dataSource, sourceId);
  }

  /** 分析一个采集源的广告特征，`log` 用于流式输出进度。 */
  async analyze(
    sourceId: string,
    log: (line: string) => void,
    samples?: SampleVod[],
  ): Promise<AdAnalyzeResult> {
    return analyzeSource(this.dataSource, sourceId, log, samples);
  }

  /**
   * 页面回传的样片：只认 http(s) 播放地址，最多 30 条。
   * 传了就用它分析（与页面上看到的列表一致），不传则服务端重新随机抽。
   */
  static toSamples(raw: unknown): SampleVod[] {
    if (!Array.isArray(raw)) return [];
    const out: SampleVod[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === 'string' ? row.url : '';
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
        name: typeof row.name === 'string' ? row.name : '',
        episode: typeof row.episode === 'string' ? row.episode : '第 1 集',
        url,
      });
      if (out.length >= 30) break;
    }
    return out;
  }
}
