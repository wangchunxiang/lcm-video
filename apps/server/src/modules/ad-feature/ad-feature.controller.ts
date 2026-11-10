import {
  Controller,
  Post,
  Res,
} from '@nestjs/common';

import {
  Raw,
} from '../../common/http/raw.decorator';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import type {
  Response,
} from 'express';

import {
  AdFeatureService,
} from './ad-feature.service';

import {
  AdFeatureAllDTO,
  AdFeatureAnalyzeDTO,
  AdFeatureBySourceDTO,
  AdFeatureCreateDTO,
  AdFeatureDeleteDTO,
  AdFeatureGetDTO,
  AdFeaturePageDTO,
  AdFeatureUpdateDTO,
} from './dto/ad-feature';

@Controller('api/admin/ad-feature')
export class AdFeatureController {
  constructor(private readonly features: AdFeatureService) {}

  @Post('create')
  create(@ZodBody(AdFeatureCreateDTO) dto: AdFeatureCreateDTO) {
    return this.features.create(dto);
  }

  @Post('update')
  update(@ZodBody(AdFeatureUpdateDTO) dto: AdFeatureUpdateDTO) {
    return this.features.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(AdFeatureDeleteDTO) dto: AdFeatureDeleteDTO) {
    return this.features.delete(dto);
  }

  @Post('get')
  get(@ZodBody(AdFeatureGetDTO) dto: AdFeatureGetDTO) {
    return this.features.get(dto);
  }

  @Post('page')
  page(@ZodBody(AdFeaturePageDTO) dto: AdFeaturePageDTO) {
    return this.features.page(dto);
  }

  @Post('all')
  all(@ZodBody(AdFeatureAllDTO) dto: AdFeatureAllDTO) {
    return this.features.all(dto);
  }

  @Post('by-source')
  bySource(@ZodBody(AdFeatureBySourceDTO) dto: AdFeatureBySourceDTO) {
    return this.features.bySource(dto);
  }

  /** 随机抽 10 部作品给前端预览 */
  @Post('pick')
  pick(@ZodBody(AdFeatureAnalyzeDTO) dto: AdFeatureAnalyzeDTO) {
    return this.features.pick(dto);
  }

  /**
   * 执行分析，边跑边以 NDJSON 推日志：每行 {type:'log'|'result'|'error'}。
   * 不走统一信封（@Raw），前端用 fetch + ReadableStream 逐行读。
   */
  @Post('analyze-stream')
  @Raw()
  async analyzeStream(
    @ZodBody(AdFeatureAnalyzeDTO) dto: AdFeatureAnalyzeDTO,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    const send = (payload: unknown) => res.write(`${JSON.stringify(payload)}\n`);
    try {
      const { features, sampled } = await this.features.analyze(dto, (text) =>
        send({ type: 'log', text }),
      );
      send({ type: 'result', features, sampled });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send({ type: 'error', message });
    } finally {
      res.end();
    }
  }
}
