import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { SourceRuleService } from './source-rule.service';
import type {
  SourceRuleAllDTO,
  SourceRuleApplyDTO,
  SourceRuleApplyResult,
  SourceRuleCreateDTO,
  SourceRuleDeleteDTO,
  SourceRuleGetDTO,
  SourceRulePageDTO,
  SourceRuleUpdateDTO,
  SourceRuleVO,
} from './dto/source-rule';
import {
  SourceRuleAllDTO as AllDTO,
  SourceRuleApplyDTO as ApplyDTO,
  SourceRuleCreateDTO as CreateDTO,
  SourceRuleDeleteDTO as DeleteDTO,
  SourceRuleGetDTO as GetDTO,
  SourceRulePageDTO as PageDTO,
  SourceRuleUpdateDTO as UpdateDTO,
} from './dto/source-rule';

/** 地址替换规则：标准六件套 + apply（把规则重刷到历史数据）。 */
@Controller('api/admin/source-rule')
export class SourceRuleController {
  constructor(private readonly service: SourceRuleService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateDTO)) dto: SourceRuleCreateDTO): Promise<SourceRuleVO> {
    return this.service.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateDTO)) dto: SourceRuleUpdateDTO): Promise<SourceRuleVO> {
    return this.service.update(dto);
  }

  @Post('delete')
  async delete(@Body(new ZodValidationPipe(DeleteDTO)) dto: SourceRuleDeleteDTO): Promise<{ deleted: number }> {
    return this.service.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetDTO)) dto: SourceRuleGetDTO): Promise<SourceRuleVO> {
    return this.service.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageDTO)) dto: SourceRulePageDTO): Promise<Page<SourceRuleVO>> {
    return this.service.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllDTO)) dto: SourceRuleAllDTO): Promise<SourceRuleVO[]> {
    return this.service.all(dto);
  }

  @Post('apply')
  async apply(@Body(new ZodValidationPipe(ApplyDTO)) dto: SourceRuleApplyDTO): Promise<SourceRuleApplyResult> {
    return this.service.apply(dto);
  }
}
