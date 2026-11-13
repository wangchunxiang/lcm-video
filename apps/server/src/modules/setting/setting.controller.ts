import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { SettingEntity } from './setting.entity';
import { SettingService } from './setting.service';
import { CreateSettingDTO, UpdateSettingDTO } from './dto/setting.dto';

/**
 * 站点配置：`@Crud()` 生成标准 REST，另外补两个便捷动作：
 * - `POST map` 一次取全部配置（前台渲染首屏要读十几个键）
 * - `POST save-many` 批量保存（设置页一次提交多个键）
 *
 * 注意：`map` 用 POST 而不是 GET，避免落到 `GET /:id` 上被当成 id 解析。
 */
@AppCrud({
  entity: SettingEntity,
  path: 'setting',
  dto: { create: CreateSettingDTO, update: UpdateSettingDTO },
})
export class SettingController {
  constructor(public readonly service: SettingService) {}

  @Post('map')
  map(): Promise<Record<string, string>> {
    return this.service.map();
  }

  @Post('save-many')
  async saveMany(@Body() dto: { entries: Array<{ key: string; value: string }> }): Promise<{ saved: number }> {
    const saved = await this.service.saveMany(dto.entries);
    return { saved };
  }
}
