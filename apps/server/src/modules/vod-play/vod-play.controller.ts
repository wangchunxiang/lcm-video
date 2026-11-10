import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { VodPlayEntity } from './vod-play.entity';
import { VodPlayService } from './vod-play.service';
import type { VodPlayRow } from './vod-play.service';
import {
  ByVodDTO,
  CreateVodPlayDTO,
  DeleteManyVodPlayDTO,
  UpdateVodPlayDTO,
} from './dto/vod-play.dto';

/** 播放线路：标准 REST + `by-vod`/`delete-many`（带「最后一条线路」保护）。 */
@Crud({
  entity: VodPlayEntity,
  path: 'api/admin/vod-play',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateVodPlayDTO, update: UpdateVodPlayDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class VodPlayController {
  constructor(public readonly service: VodPlayService) {}

  /** 某影片的全部线路（含解析后的集数）。 */
  @Post('by-vod')
  byVod(@Body() dto: ByVodDTO): Promise<VodPlayRow[]> {
    return this.service.byVod(dto.vodId);
  }

  /** 批量删除（默认拦最后一条线路）。 */
  @Post('delete-many')
  deleteMany(@Body() dto: DeleteManyVodPlayDTO): Promise<{ deleted: number }> {
    return this.service.deleteManyChecked(dto);
  }

}
