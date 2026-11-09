import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { PlayLineService } from './play-line.service';
import type {
  PlayLineAllDTO,
  PlayLineBatchDTO,
  PlayLineCreateDTO,
  PlayLineDeleteDTO,
  PlayLineGetDTO,
  PlayLinePageDTO,
  PlayLineSortDTO,
  PlayLineUpdateDTO,
  PlayLineVO,
} from './dto/play-line';
import {
  PlayLineAllDTO as AllSchema,
  PlayLineBatchDTO as BatchSchema,
  PlayLineCreateDTO as CreateSchema,
  PlayLineDeleteDTO as DeleteSchema,
  PlayLineGetDTO as GetSchema,
  PlayLinePageDTO as PageSchema,
  PlayLineSortDTO as SortSchema,
  PlayLineUpdateDTO as UpdateSchema,
} from './dto/play-line';

/**
 * 线路表：标准六件套 + batch（批量启停）+ sort（拖拽排序）。
 * 全部 POST，路径 /api/admin/play-line/<动作>。
 */
@Controller('api/admin/play-line')
export class PlayLineController {
  constructor(private readonly playLineService: PlayLineService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: PlayLineCreateDTO): Promise<PlayLineVO> {
    return this.playLineService.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: PlayLineUpdateDTO): Promise<PlayLineVO> {
    return this.playLineService.update(dto);
  }

  @Post('delete')
  async delete(@Body(new ZodValidationPipe(DeleteSchema)) dto: PlayLineDeleteDTO): Promise<{ deleted: number }> {
    return this.playLineService.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: PlayLineGetDTO): Promise<PlayLineVO> {
    return this.playLineService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: PlayLinePageDTO): Promise<Page<PlayLineVO>> {
    return this.playLineService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: PlayLineAllDTO): Promise<PlayLineVO[]> {
    return this.playLineService.all(dto);
  }

  @Post('batch')
  async batch(@Body(new ZodValidationPipe(BatchSchema)) dto: PlayLineBatchDTO): Promise<{ updated: number }> {
    return this.playLineService.batch(dto);
  }

  @Post('sort')
  async sort(@Body(new ZodValidationPipe(SortSchema)) dto: PlayLineSortDTO): Promise<null> {
    return this.playLineService.sort(dto);
  }
}
