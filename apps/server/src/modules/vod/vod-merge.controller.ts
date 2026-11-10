import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { VodMergeService } from './vod-merge.service';
import {
  VodMergeBatchDTO as BatchDTO,
  VodMergeBatchKeysDTO as BatchKeysDTO,
  VodMergeGroupDTO as GroupDTO,
  VodMergeIgnoreDTO as IgnoreDTO,
  VodMergeMergeDTO as MergeDTO,
} from './dto/vod-merge';

/**
 * 重复影片合并工具。
 * 归属在 vod 表下（这些操作本来就是 vod 的批量行为），单独一个 controller 只为不让 vod.controller 膨胀。
 */
@Controller('api/admin/vod-merge')
export class VodMergeController {
  constructor(private readonly merge: VodMergeService) {}

  /** 三类分组预览 + 汇总 */
  @Post('preview')
  preview() {
    return this.merge.preview();
  }

  /** 单组详情（成员与线路来源） */
  @Post('group')
  group(@Body(new ZodValidationPipe(GroupDTO)) dto: GroupDTO) {
    return this.merge.group(dto);
  }

  /** 合并一组 */
  @Post('merge')
  mergeGroup(@Body(new ZodValidationPipe(MergeDTO)) dto: MergeDTO) {
    return this.merge.merge(dto);
  }

  /** 忽略 / 恢复一个分组 */
  @Post('ignore')
  ignore(@Body(new ZodValidationPipe(IgnoreDTO)) dto: IgnoreDTO) {
    return this.merge.ignore(dto);
  }

  /** 一键合并全部可自动合并的分组 */
  @Post('batch')
  batch(@Body(new ZodValidationPipe(BatchDTO)) dto: BatchDTO) {
    return this.merge.batch(dto);
  }

  /** 勾选若干分组批量合并或忽略 */
  @Post('batch-keys')
  batchKeys(@Body(new ZodValidationPipe(BatchKeysDTO)) dto: BatchKeysDTO) {
    return this.merge.batchKeys(dto);
  }
}
