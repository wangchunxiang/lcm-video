import { Controller, Get, Param, Query } from '@nestjs/common';
import { WEB_API_PREFIX } from '../../common/http/api-prefix';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import type { CategoryNode, EpisodeItem, PlayLine, SiteConfig, VodCard, VodRow } from './portal.service';

/** 前台只读接口：全部公开，不需要登录。 */
@Controller(WEB_API_PREFIX)
@Public()
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  /** 首页：分类树 + 分区卡片。 */
  @Get('home')
  home(): Promise<{ categories: CategoryNode[]; hero: VodCard[]; rows: VodRow[] }> {
    return this.portal.home();
  }

  /** 分类树。 */
  @Get('categories')
  categories(): Promise<CategoryNode[]> {
    return this.portal.categories();
  }

  /** 前台公共配置：站点信息与播放器开关。 */
  @Get('config')
  config(): Promise<SiteConfig> {
    return this.portal.config();
  }

  /** 列表页：`/list/:alias`，别名必须是一级分类 alias（没有 `all` 聚合页）。 */
  @Get('list/:alias')
  list(
    @Param('alias') alias: string,
    @Query('type') type?: string,
    @Query('year') year?: string,
    @Query('sort') sort?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.portal.list({ alias, typeAlias: type, year, sort, take, skip });
  }

  /** 详情页。 */
  @Get('detail/:id')
  detail(@Param('id') id: string) {
    return this.portal.detail(id);
  }

  /** 播放页：`line` 是线路序号，`ep` 是集序号（从 1 开始）。 */
  @Get('play/:id')
  play(
    @Param('id') id: string,
    @Query('line') line?: string,
    @Query('ep') ep?: string,
  ): Promise<{
    vod: { id: string; name: string; cover: string; remarks: string };
    lines: PlayLine[];
    line: PlayLine;
    episodes: EpisodeItem[];
    current: number;
  }> {
    return this.portal.play(id, line, ep);
  }

  /** 搜索。 */
  @Get('search')
  search(
    @Query('wd') wd?: string,
    @Query('year') year?: string,
    @Query('sort') sort?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<{ items: VodCard[]; total: number }> {
    return this.portal.search({ wd, year, sort, take, skip });
  }
}
