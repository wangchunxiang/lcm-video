import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { VodService } from './vod.service';
import type {
  VodAllDTO,
  VodBatchDTO,
  VodCreateDTO,
  VodDeleteDTO,
  VodDetailVO,
  VodGetDTO,
  VodPageDTO,
  VodRecollectDTO,
  VodUpdateDTO,
  VodVO,
} from './dto/vod';
import {
  VodAllDTO as AllSchema,
  VodBatchDTO as BatchSchema,
  VodCreateDTO as CreateSchema,
  VodDeleteDTO as DeleteSchema,
  VodGetDTO as GetSchema,
  VodPageDTO as PageSchema,
  VodRecollectDTO as RecollectSchema,
  VodUpdateDTO as UpdateSchema,
} from './dto/vod';

/**
 * 影片表：标准六件套 + batch（批量改分类/上下架）。
 * 全部 POST，路径 /api/admin/vod/<动作>。
 */
@Controller('api/admin/vod')
export class VodController {
  constructor(private readonly vodService: VodService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: VodCreateDTO): Promise<VodVO> {
    return this.vodService.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: VodUpdateDTO): Promise<VodVO> {
    return this.vodService.update(dto);
  }

  @Post('delete')
  async delete(@Body(new ZodValidationPipe(DeleteSchema)) dto: VodDeleteDTO): Promise<{ deleted: number }> {
    return this.vodService.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: VodGetDTO): Promise<VodDetailVO> {
    return this.vodService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: VodPageDTO): Promise<Page<VodVO>> {
    return this.vodService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: VodAllDTO): Promise<VodVO[]> {
    return this.vodService.all(dto);
  }

  /** 重新采集：按原始采集源再拉一次这一部影片 */
  @Post('recollect')
  async recollect(
    @Body(new ZodValidationPipe(RecollectSchema)) dto: VodRecollectDTO,
  ): Promise<{ inserted: number; updated: number; failed: number; fails: unknown[] }> {
    return this.vodService.recollect(dto);
  }

  @Post('batch')
  async batch(@Body(new ZodValidationPipe(BatchSchema)) dto: VodBatchDTO): Promise<{ affected: number }> {
    return this.vodService.batch(dto);
  }
}
