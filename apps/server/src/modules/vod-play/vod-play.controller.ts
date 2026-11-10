import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  VodPlayService,
} from './vod-play.service';

import {
  VodPlayAllDTO,
  VodPlayByVodDTO,
  VodPlayCreateDTO,
  VodPlayDeleteDTO,
  VodPlayGetDTO,
  VodPlayPageDTO,
  VodPlayUpdateDTO,
} from './dto/vod-play';

import type {
  VodPlayDetailVO,
  VodPlayVO,
} from './dto/vod-play';

/**
 * 影片线路表：标准六件套 + by-vod（按影片取线路与剧集）。
 * 全部 POST，路径 /api/admin/vod-play/<动作>。
 */
@Controller('api/admin/vod-play')
export class VodPlayController {
  constructor(private readonly vodPlayService: VodPlayService) {}

  @Post('create')
  async create(@ZodBody(VodPlayCreateDTO) dto: VodPlayCreateDTO): Promise<VodPlayVO> {
    return this.vodPlayService.create(dto);
  }

  @Post('update')
  async update(@ZodBody(VodPlayUpdateDTO) dto: VodPlayUpdateDTO): Promise<VodPlayVO> {
    return this.vodPlayService.update(dto);
  }

  @Post('delete')
  async delete(
    @ZodBody(VodPlayDeleteDTO) dto: VodPlayDeleteDTO,
  ): Promise<{ deleted: number }> {
    return this.vodPlayService.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(VodPlayGetDTO) dto: VodPlayGetDTO): Promise<VodPlayVO> {
    return this.vodPlayService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(VodPlayPageDTO) dto: VodPlayPageDTO): Promise<Page<VodPlayVO>> {
    return this.vodPlayService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(VodPlayAllDTO) dto: VodPlayAllDTO): Promise<VodPlayVO[]> {
    return this.vodPlayService.all(dto);
  }

  @Post('by-vod')
  async byVod(
    @ZodBody(VodPlayByVodDTO) dto: VodPlayByVodDTO,
  ): Promise<VodPlayDetailVO[]> {
    return this.vodPlayService.byVod(dto);
  }
}
