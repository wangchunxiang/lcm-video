import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { VodEntity } from './vod.entity';
import { VodService } from './vod.service';
import { BatchVodDTO, CreateVodDTO, RecollectDTO, UpdateVodDTO } from './dto/vod.dto';

/** 影片管理：标准 REST + 批量改分类/上下架。 */
@AppCrud({
  entity: VodEntity,
  path: 'api/admin/vod',
  dto: { create: CreateVodDTO, update: UpdateVodDTO },
})
export class VodController {
  constructor(public readonly service: VodService) {}

  /** 批量改分类或上下架。 */
  @Post('batch')
  async batch(@Body() dto: BatchVodDTO): Promise<{ updated: number }> {
    return this.service.batch(dto);
  }

  /** 重新采集单片：回源站取这一部并按当前入库规则覆盖。 */
  @Post('recollect')
  recollect(
    @Body() dto: RecollectDTO,
  ): Promise<{ inserted: number; updated: number; failed: number; fails: unknown[] }> {
    return this.service.recollect(dto);
  }
}
