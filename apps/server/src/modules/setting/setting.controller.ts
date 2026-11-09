import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { SettingDTO, SettingUpdateDTO, SettingVO } from './dto/setting';
import { SettingUpdateDTO as UpdateSchema } from './dto/setting';
import { SettingDTO as GetSchema } from './dto/setting';
import { SettingService } from './setting.service';

@Controller('api/admin/setting')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Post('all')
  async all(): Promise<SettingVO[]> {
    return this.settingService.all();
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: SettingDTO): Promise<SettingVO> {
    return this.settingService.get(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: SettingUpdateDTO): Promise<SettingVO> {
    return this.settingService.update(dto);
  }
}
