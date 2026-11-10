import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  SourceRuleService,
} from './source-rule.service';

import {
  SourceRuleAllDTO,
  SourceRuleApplyDTO,
  SourceRuleCreateDTO,
  SourceRuleDeleteDTO,
  SourceRuleGetDTO,
  SourceRulePageDTO,
  SourceRuleUpdateDTO,
} from './dto/source-rule';

import type {
  SourceRuleApplyResult,
  SourceRuleVO,
} from './dto/source-rule';

/** 地址替换规则：标准六件套 + apply（把规则重刷到历史数据）。 */
@Controller('api/admin/source-rule')
export class SourceRuleController {
  constructor(private readonly service: SourceRuleService) {}

  @Post('create')
  async create(@ZodBody(SourceRuleCreateDTO) dto: SourceRuleCreateDTO): Promise<SourceRuleVO> {
    return this.service.create(dto);
  }

  @Post('update')
  async update(@ZodBody(SourceRuleUpdateDTO) dto: SourceRuleUpdateDTO): Promise<SourceRuleVO> {
    return this.service.update(dto);
  }

  @Post('delete')
  async delete(@ZodBody(SourceRuleDeleteDTO) dto: SourceRuleDeleteDTO): Promise<{ deleted: number }> {
    return this.service.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(SourceRuleGetDTO) dto: SourceRuleGetDTO): Promise<SourceRuleVO> {
    return this.service.get(dto);
  }

  @Post('page')
  async page(@ZodBody(SourceRulePageDTO) dto: SourceRulePageDTO): Promise<Page<SourceRuleVO>> {
    return this.service.page(dto);
  }

  @Post('all')
  async all(@ZodBody(SourceRuleAllDTO) dto: SourceRuleAllDTO): Promise<SourceRuleVO[]> {
    return this.service.all(dto);
  }

  @Post('apply')
  async apply(@ZodBody(SourceRuleApplyDTO) dto: SourceRuleApplyDTO): Promise<SourceRuleApplyResult> {
    return this.service.apply(dto);
  }
}
