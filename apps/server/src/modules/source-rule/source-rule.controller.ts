import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { SourceRuleEntity } from './source-rule.entity';
import { SourceRuleService } from './source-rule.service';
import type { SourceRuleApplyResult } from './source-rule.service';
import { ApplyDTO, CreateSourceRuleDTO, UpdateSourceRuleDTO } from './dto/source-rule.dto';

/** 地址替换规则：标准 REST + 历史数据重刷。 */
@AppCrud({
  entity: SourceRuleEntity,
  path: 'api/admin/source-rule',
  dto: { create: CreateSourceRuleDTO, update: UpdateSourceRuleDTO },
})
export class SourceRuleController {
  constructor(public readonly service: SourceRuleService) {}

  /** 把规则套到已有数据上；confirm=false 只返回影响条数。 */
  @Post('apply')
  apply(@Body() dto: ApplyDTO): Promise<SourceRuleApplyResult> {
    return this.service.apply(dto.id, dto.confirm === true);
  }
}
