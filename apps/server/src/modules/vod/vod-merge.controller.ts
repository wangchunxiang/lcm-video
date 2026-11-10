import {
  Controller,
  Post,
} from '@nestjs/common';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  VodMergeService,
} from './vod-merge.service';

import {
  VodMergeBatchDTO,
  VodMergeBatchKeysDTO,
  VodMergeGroupDTO,
  VodMergeIgnoreDTO,
  VodMergeMergeDTO,
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
  group(@ZodBody(VodMergeGroupDTO) dto: VodMergeGroupDTO) {
    return this.merge.group(dto);
  }

  /** 合并一组 */
  @Post('merge')
  mergeGroup(@ZodBody(VodMergeMergeDTO) dto: VodMergeMergeDTO) {
    return this.merge.merge(dto);
  }

  /** 忽略 / 恢复一个分组 */
  @Post('ignore')
  ignore(@ZodBody(VodMergeIgnoreDTO) dto: VodMergeIgnoreDTO) {
    return this.merge.ignore(dto);
  }

  /** 一键合并全部可自动合并的分组 */
  @Post('batch')
  batch(@ZodBody(VodMergeBatchDTO) dto: VodMergeBatchDTO) {
    return this.merge.batch(dto);
  }

  /** 勾选若干分组批量合并或忽略 */
  @Post('batch-keys')
  batchKeys(@ZodBody(VodMergeBatchKeysDTO) dto: VodMergeBatchKeysDTO) {
    return this.merge.batchKeys(dto);
  }
}
