import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  PlayLineService,
} from './play-line.service';

import {
  PlayLineAllDTO,
  PlayLineBatchDTO,
  PlayLineCreateDTO,
  PlayLineDeleteDTO,
  PlayLineGetDTO,
  PlayLinePageDTO,
  PlayLineSortDTO,
  PlayLineUpdateDTO,
} from './dto/play-line';

import type {
  PlayLineVO,
} from './dto/play-line';

/**
 * 线路表：标准六件套 + batch（批量启停）+ sort（拖拽排序）。
 * 全部 POST，路径 /api/admin/play-line/<动作>。
 */
@Controller('api/admin/play-line')
export class PlayLineController {
  constructor(private readonly playLineService: PlayLineService) {}

  @Post('create')
  async create(@ZodBody(PlayLineCreateDTO) dto: PlayLineCreateDTO): Promise<PlayLineVO> {
    return this.playLineService.create(dto);
  }

  @Post('update')
  async update(@ZodBody(PlayLineUpdateDTO) dto: PlayLineUpdateDTO): Promise<PlayLineVO> {
    return this.playLineService.update(dto);
  }

  @Post('delete')
  async delete(@ZodBody(PlayLineDeleteDTO) dto: PlayLineDeleteDTO): Promise<{ deleted: number }> {
    return this.playLineService.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(PlayLineGetDTO) dto: PlayLineGetDTO): Promise<PlayLineVO> {
    return this.playLineService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(PlayLinePageDTO) dto: PlayLinePageDTO): Promise<Page<PlayLineVO>> {
    return this.playLineService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(PlayLineAllDTO) dto: PlayLineAllDTO): Promise<PlayLineVO[]> {
    return this.playLineService.all(dto);
  }

  @Post('batch')
  async batch(@ZodBody(PlayLineBatchDTO) dto: PlayLineBatchDTO): Promise<{ updated: number }> {
    return this.playLineService.batch(dto);
  }

  @Post('sort')
  async sort(@ZodBody(PlayLineSortDTO) dto: PlayLineSortDTO): Promise<null> {
    return this.playLineService.sort(dto);
  }
}
