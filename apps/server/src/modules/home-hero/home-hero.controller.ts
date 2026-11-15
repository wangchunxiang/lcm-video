import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { HomeHeroEntity } from './home-hero.entity';
import { HomeHeroService } from './home-hero.service';
import type { HomeHeroRow } from './home-hero.service';
import { CreateHomeHeroDTO, HomeHeroRowsDTO, UpdateHomeHeroDTO } from './dto/home-hero.dto';

/**
 * 首页 hero 管理：`@AppCrud` 生成标准 REST（建/改/删/列表），
 * 另外给后台表格一个 `rows`——配置行自带影片名、封面与分类，后台不用拿 `vod_id` 反查；
 * 过滤与分页都在服务端做，和「采集源站」那页保持同一套列表协议。
 */
@AppCrud({
  entity: HomeHeroEntity,
  path: 'home-hero',
  dto: { create: CreateHomeHeroDTO, update: UpdateHomeHeroDTO },
})
export class HomeHeroController {
  constructor(public readonly service: HomeHeroService) {}

  /** 后台表格用：按 `sort` 排好，可关键词搜索、可按显示状态过滤、分页。 */
  @Post('rows')
  rows(@Body() dto: HomeHeroRowsDTO): Promise<{ items: HomeHeroRow[]; total: number }> {
    return this.service.rows(dto);
  }
}
