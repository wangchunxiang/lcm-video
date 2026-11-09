import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CoverCheckService } from './cover-check.service';
import {
  CoverCheckAllDTO as AllDTO,
  CoverCheckCreateDTO as CreateDTO,
  CoverCheckDeleteDTO as DeleteDTO,
  CoverCheckGetDTO as GetDTO,
  CoverCheckHostVodsDTO as HostVodsDTO,
  CoverCheckPageDTO as PageDTO,
  CoverCheckUpdateDTO as UpdateDTO,
} from './dto/cover-check';

@Controller('api/admin/cover-check')
export class CoverCheckController {
  constructor(private readonly checks: CoverCheckService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.checks.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.checks.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.checks.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.checks.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.checks.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.checks.all(dto);
  }

  /** 图片检查页的域名列表（影片数实时统计 + 上次检查结果） */
  @Post('hosts')
  hosts() {
    return this.checks.hosts();
  }

  /** 某域名下的影片，供换封面/清空前预览 */
  @Post('host-vods')
  hostVods(@Body(new ZodValidationPipe(HostVodsDTO)) dto: HostVodsDTO) {
    return this.checks.hostVods(dto);
  }
}
