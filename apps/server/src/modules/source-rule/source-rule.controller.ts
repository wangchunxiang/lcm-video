import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { SourceRuleEntity } from './source-rule.entity';
import { SourceRuleService } from './source-rule.service';
import type { SourceRuleApplyResult } from './source-rule.service';
import { CreateSourceRuleDTO, UpdateSourceRuleDTO } from './dto/source-rule.dto';

/** 重刷入参：confirm=false 只预览。 */
class ApplyDTO {
  @IsString({ message: '必须是数字 id' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  id!: string;

  @IsOptional()
  @IsBoolean({ message: 'confirm 必须是布尔值' })
  confirm?: boolean;
}

/** 地址替换规则：标准 REST + 历史数据重刷。 */
@Crud({
  entity: SourceRuleEntity,
  path: 'api/admin/source-rule',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateSourceRuleDTO, update: UpdateSourceRuleDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class SourceRuleController {
  constructor(public readonly service: SourceRuleService) {}

  /** 把规则套到已有数据上；confirm=false 只返回影响条数。 */
  @Post('apply')
  apply(@Body() dto: ApplyDTO): Promise<SourceRuleApplyResult> {
    return this.service.apply(dto.id, dto.confirm === true);
  }
}
