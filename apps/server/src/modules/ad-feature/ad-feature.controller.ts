import { Body, Post, Res } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import type { Response } from 'express';
import { Raw } from '../../common/decorators/raw.decorator';
import { SourceIdDTO } from '../../common/dto/id.dto';
import { AdFeatureEntity } from './ad-feature.entity';
import { AdFeatureService } from './ad-feature.service';
import type { AdAnalyzeResult } from './ad-feature.service';
import { AnalyzeDTO, CreateAdFeatureDTO, UpdateAdFeatureDTO } from './dto/ad-feature.dto';

/** 广告特征：标准 REST + 抽样预览 / 流式分析。 */
@AppCrud({
  entity: AdFeatureEntity,
  path: 'api/admin/ad-feature',
  dto: { create: CreateAdFeatureDTO, update: UpdateAdFeatureDTO },
})
export class AdFeatureController {
  constructor(public readonly service: AdFeatureService) {}

  /** 预览抽样结果（10 部作品）。 */
  @Post('pick')
  pick(@Body() dto: SourceIdDTO): Promise<unknown> {
    return this.service.pick(dto.sourceId);
  }

  /** 一次性分析，返回完整结果（后台脚本/测试用）。 */
  @Post('analyze')
  analyze(@Body() dto: AnalyzeDTO): Promise<AdAnalyzeResult> {
    return this.service.analyze(dto.sourceId, () => undefined, AdFeatureService.toSamples(dto.sample));
  }

  /**
   * 流式分析：NDJSON 逐行推送进度。
   * 每行 `{type:'log'|'result'|'error', ...}`；`@Raw()` 跳过统一信封。
   */
  @Post('analyze-stream')
  @Raw()
  async analyzeStream(@Body() dto: AnalyzeDTO, @Res() res: Response): Promise<void> {
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const write = (line: Record<string, unknown>): void => {
      if (closed) return;
      res.write(`${JSON.stringify(line)}\n`);
    };
    try {
      const result = await this.service.analyze(dto.sourceId, (line) => write({ type: 'log', msg: line }), AdFeatureService.toSamples(dto.sample));
      write({ type: 'result', ...result });
    } catch (error) {
      write({ type: 'error', msg: error instanceof Error ? error.message : String(error) });
    } finally {
      res.end();
    }
  }
}
