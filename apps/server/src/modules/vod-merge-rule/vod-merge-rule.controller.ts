import { Body, Controller, Get, Put } from '@nestjs/common';
import { UpdateVodMergeRuleDTO } from './dto/vod-merge-rule.dto';
import { VodMergeRuleService } from './vod-merge-rule.service';
import type { MergeRuleView } from './vod-merge-rule.service';

/**
 * 入库合并规则：整份读写，不走 nest-crud。
 *
 * 规则是「一个字段一行」，但后台只有一个保存按钮，所以 PUT 收整份提交、
 * 服务端按白名单逐项校验后一次性 upsert。
 */
@Controller('api/admin/vod-merge-rule')
export class VodMergeRuleController {
  constructor(private readonly service: VodMergeRuleService) {}

  @Get()
  get(): Promise<MergeRuleView> {
    return this.service.get();
  }

  @Put()
  save(@Body() dto: UpdateVodMergeRuleDTO): Promise<{ saved: number; updatedAt: string }> {
    return this.service.save(dto);
  }
}
