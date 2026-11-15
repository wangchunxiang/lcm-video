import { Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { HomeHeroEntity } from './home-hero.entity';
import { HomeHeroService } from './home-hero.service';
import type { HomeHeroRow } from './home-hero.service';
import { CreateHomeHeroDTO, UpdateHomeHeroDTO } from './dto/home-hero.dto';

/**
 * 首页 hero 管理：`@AppCrud` 生成标准 REST（建/改/删/列表），
 * 另外给表格一个 `rows`——配置行自带影片名与封面，后台不用拿 `vod_id` 反查。
 */
@AppCrud({
  entity: HomeHeroEntity,
  path: 'home-hero',
  dto: { create: CreateHomeHeroDTO, update: UpdateHomeHeroDTO },
})
export class HomeHeroController {
  constructor(public readonly service: HomeHeroService) {}

  /** 后台表格用：按 `sort` 排好，带影片信息。 */
  @Post('rows')
  rows(): Promise<HomeHeroRow[]> {
    return this.service.rows();
  }
}
