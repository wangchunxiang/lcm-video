import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WEB_API_PREFIX } from '../../common/http/api-prefix';
import { Public } from '../../common/decorators/public.decorator';
import { Raw } from '../../common/decorators/raw.decorator';
import { PortalService } from './portal.service';
import type { CategoryNode, EpisodeItem, PlayLine, SiteConfig, VodCard, VodRow } from './portal.service';

/** 前台只读接口：全部公开，不需要登录。 */
@Controller(WEB_API_PREFIX)
@Public()
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  /** 首页：分类树 + 分区卡片。 */
  @Get('home')
  home(): Promise<{ categories: CategoryNode[]; rows: VodRow[] }> {
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

  /**
   * 播放列表代理：`/api/web/play` 返回的 `playUrl` 指向这里。
   * 一律由本站返回 m3u8 正文：命中该源已确认的广告特征时是删掉广告分片的版本，没命中就是
   * 逐行绝对化后的原文。**不做 302**——Apple 原生播放器对 media 请求的重定向很脆弱，
   * 源站往往自己还要再跳一次，多一跳就多一次偶发失败；把播放器甩回源站等于把唯一的
   * 失败点交给它。上游拉不到正文时直接报 502，让播放器明确失败（用户换线路即可）。
   * 地址带签名（`playlist-proxy.ts`），不是本服务签出的一律 403。
   */
  @Get('playlist')
  @Raw()
  async playlist(
    @Query('sourceId') sourceId: string,
    @Query('u') token: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    // 地址与签名都在 service 里校验过，这里只直出校验通过的那个地址的正文
    const { clean } = await this.portal.proxiedPlaylist(sourceId, token, sig);
    if (clean === null) {
      // 上游没拉到正文（超时/报错）：直接报错，不再把播放器甩回源站
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.status(502).send('播放列表拉取失败');
      return;
    }
    res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
    /*
     * 一律 no-store：播放列表是「当下这次播放」的东西（签名地址、广告特征都可能变），
     * 交给客户端缓存只会引入难查的「同一部片有的人能播有的人不能」。想省的那一跳在服务端做
     * 就够了（见 proxiedPlaylist 的 SWR 缓存）。
     */
    res.setHeader('cache-control', 'no-store');
    /*
     * 用 res.end 而不是 res.send：`send` 会算弱 ETag 并做新鲜度判定，客户端带 If-None-Match
     * 回来就回 304，而 304 没有正文。播放器拿到空 manifest 未必会回退到本地副本，最坏是
     * 直接判失败；这里显式给 Content-Length 再直出字节，不可能出现 304。
     */
    res.setHeader('content-length', Buffer.byteLength(clean.text));
    res.end(clean.text);
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
