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
  async analyze(sourceId: string, log: (line: string) => void): Promise<AdAnalyzeResult> {
    return analyzeSource(this.dataSource, sourceId, log);
  }
}
