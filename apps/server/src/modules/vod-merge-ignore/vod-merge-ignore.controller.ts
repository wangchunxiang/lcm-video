import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';
import {
  ByKeysDTO,
  CreateVodMergeIgnoreDTO,
  ToggleDTO,
  UpdateVodMergeIgnoreDTO,
} from './dto/vod-merge-ignore.dto';

/** 重复影片忽略名单：标准 REST + 幂等开关 + 批量查询。 */
@AppCrud({
  entity: VodMergeIgnoreEntity,
  path: 'api/admin/vod-merge-ignore',
  dto: { create: CreateVodMergeIgnoreDTO, update: UpdateVodMergeIgnoreDTO },
})
export class VodMergeIgnoreController {
  constructor(public readonly service: VodMergeIgnoreService) {}

  /** 幂等切换忽略状态。 */
  @Post('toggle')
  toggle(@Body() dto: ToggleDTO): Promise<{ ignored: boolean; id: string }> {
    return this.service.toggle(dto.mergeKey, dto.kind ?? 1, dto.ignored);
  }

  /** 批量查哪些分组已在忽略名单里。 */
  @Post('by-keys')
  byKeys(@Body() dto: ByKeysDTO): Promise<{ keys: string[] }> {
    return this.service.byKeys(dto.keys);
  }
}
