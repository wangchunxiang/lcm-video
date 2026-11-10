import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Raw } from '../../common/raw.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdFeatureService } from './ad-feature.service';
import {
  AdFeatureAllDTO as AllDTO,
  AdFeatureAnalyzeDTO as AnalyzeDTO,
  AdFeatureBySourceDTO as BySourceDTO,
  AdFeatureCreateDTO as CreateDTO,
  AdFeatureDeleteDTO as DeleteDTO,
  AdFeatureGetDTO as GetDTO,
  AdFeaturePageDTO as PageDTO,
  AdFeatureUpdateDTO as UpdateDTO,
} from './dto/ad-feature';

@Controller('api/admin/ad-feature')
export class AdFeatureController {
  constructor(private readonly features: AdFeatureService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.features.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.features.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.features.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.features.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.features.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.features.all(dto);
  }

  @Post('by-source')
  bySource(@Body(new ZodValidationPipe(BySourceDTO)) dto: BySourceDTO) {
    return this.features.bySource(dto);
  }

  /** 随机抽 10 部作品给前端预览 */
  @Post('pick')
  pick(@Body(new ZodValidationPipe(AnalyzeDTO)) dto: AnalyzeDTO) {
    return this.features.pick(dto);
  }

  /**
   * 执行分析，边跑边以 NDJSON 推日志：每行 {type:'log'|'result'|'error'}。
   * 不走统一信封（@Raw），前端用 fetch + ReadableStream 逐行读。
   */
  @Post('analyze-stream')
  @Raw()
  async analyzeStream(
    @Body(new ZodValidationPipe(AnalyzeDTO)) dto: AnalyzeDTO,
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
