import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { VodPlayService } from './vod-play.service';
import type {
  VodPlayAllDTO,
  VodPlayByVodDTO,
  VodPlayCreateDTO,
  VodPlayDeleteDTO,
  VodPlayDetailVO,
  VodPlayGetDTO,
  VodPlayPageDTO,
  VodPlayUpdateDTO,
  VodPlayVO,
} from './dto/vod-play';
import {
  VodPlayAllDTO as AllSchema,
  VodPlayByVodDTO as ByVodSchema,
  VodPlayCreateDTO as CreateSchema,
  VodPlayDeleteDTO as DeleteSchema,
  VodPlayGetDTO as GetSchema,
  VodPlayPageDTO as PageSchema,
  VodPlayUpdateDTO as UpdateSchema,
} from './dto/vod-play';

/**
 * 影片线路表：标准六件套 + by-vod（按影片取线路与剧集）。
 * 全部 POST，路径 /api/admin/vod-play/<动作>。
 */
@Controller('api/admin/vod-play')
export class VodPlayController {
  constructor(private readonly vodPlayService: VodPlayService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: VodPlayCreateDTO): Promise<VodPlayVO> {
    return this.vodPlayService.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: VodPlayUpdateDTO): Promise<VodPlayVO> {
    return this.vodPlayService.update(dto);
  }

  @Post('delete')
  async delete(
    @Body(new ZodValidationPipe(DeleteSchema)) dto: VodPlayDeleteDTO,
  ): Promise<{ deleted: number }> {
    return this.vodPlayService.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: VodPlayGetDTO): Promise<VodPlayVO> {
    return this.vodPlayService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: VodPlayPageDTO): Promise<Page<VodPlayVO>> {
    return this.vodPlayService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: VodPlayAllDTO): Promise<VodPlayVO[]> {
    return this.vodPlayService.all(dto);
  }

  @Post('by-vod')
  async byVod(
    @Body(new ZodValidationPipe(ByVodSchema)) dto: VodPlayByVodDTO,
  ): Promise<VodPlayDetailVO[]> {
    return this.vodPlayService.byVod(dto);
  }
}
