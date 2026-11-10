import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  VodService,
} from './vod.service';

import {
  VodAllDTO,
  VodBatchDTO,
  VodCreateDTO,
  VodDeleteDTO,
  VodGetDTO,
  VodPageDTO,
  VodRecollectDTO,
  VodUpdateDTO,
} from './dto/vod';

import type {
  VodDetailVO,
  VodVO,
} from './dto/vod';

/**
 * 影片表：标准六件套 + batch（批量改分类/上下架）。
 * 全部 POST，路径 /api/admin/vod/<动作>。
 */
@Controller('api/admin/vod')
export class VodController {
  constructor(private readonly vodService: VodService) {}

  @Post('create')
  async create(@ZodBody(VodCreateDTO) dto: VodCreateDTO): Promise<VodVO> {
    return this.vodService.create(dto);
  }

  @Post('update')
  async update(@ZodBody(VodUpdateDTO) dto: VodUpdateDTO): Promise<VodVO> {
    return this.vodService.update(dto);
  }

  @Post('delete')
  async delete(@ZodBody(VodDeleteDTO) dto: VodDeleteDTO): Promise<{ deleted: number }> {
    return this.vodService.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(VodGetDTO) dto: VodGetDTO): Promise<VodDetailVO> {
    return this.vodService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(VodPageDTO) dto: VodPageDTO): Promise<Page<VodVO>> {
    return this.vodService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(VodAllDTO) dto: VodAllDTO): Promise<VodVO[]> {
    return this.vodService.all(dto);
  }

  /** 重新采集：按原始采集源再拉一次这一部影片 */
  @Post('recollect')
  async recollect(
    @ZodBody(VodRecollectDTO) dto: VodRecollectDTO,
  ): Promise<{ inserted: number; updated: number; failed: number; fails: unknown[] }> {
    return this.vodService.recollect(dto);
  }

  @Post('batch')
  async batch(@ZodBody(VodBatchDTO) dto: VodBatchDTO): Promise<{ affected: number }> {
    return this.vodService.batch(dto);
  }
}
