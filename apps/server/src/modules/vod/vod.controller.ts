import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { VodEntity } from './vod.entity';
import { VodService } from './vod.service';
import { BatchVodDTO, CreateVodDTO, UpdateVodDTO } from './dto/vod.dto';

/** 影片管理：标准 REST + 批量改分类/上下架。 */
@Crud({
  entity: VodEntity,
  path: 'api/admin/vod',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateVodDTO, update: UpdateVodDTO },
  messages: { deleted: '影片已删除' },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class VodController {
  constructor(public readonly service: VodService) {}

  /** 批量改分类或上下架。 */
  @Post('batch')
  async batch(@Body() dto: BatchVodDTO): Promise<{ updated: number }> {
    return this.service.batch(dto);
  }
}
