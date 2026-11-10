import {
  Controller,
  Post,
} from '@nestjs/common';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  SettingDTO,
  SettingUpdateDTO,
  type SettingVO,
} from './dto/setting';

import {
  SettingService,
} from './setting.service';

@Controller('api/admin/setting')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Post('all')
  async all(): Promise<SettingVO[]> {
    return this.settingService.all();
  }

  @Post('get')
  async get(@ZodBody(SettingDTO) dto: SettingDTO): Promise<SettingVO> {
    return this.settingService.get(dto);
  }

  @Post('update')
  async update(@ZodBody(SettingUpdateDTO) dto: SettingUpdateDTO): Promise<SettingVO> {
    return this.settingService.update(dto);
  }
}
