import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CoverCheckService } from './cover-check.service';
import {
  CoverCheckAllDTO as AllDTO,
  CoverCheckClearDTO as ClearDTO,
  CoverCheckCreateDTO as CreateDTO,
  CoverCheckDeleteDTO as DeleteDTO,
  CoverCheckGetDTO as GetDTO,
  CoverCheckHostVodsDTO as HostVodsDTO,
  CoverCheckPageDTO as PageDTO,
  CoverCheckRepairDTO as RepairDTO,
  CoverCheckScanDTO as ScanDTO,
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

  /** 检查一个域名或全部域名 */
  @Post('scan')
  scan(@Body(new ZodValidationPipe(ScanDTO)) dto: ScanDTO) {
    return this.checks.scan(dto);
  }

  /** 清空某域名下的封面 */
  @Post('clear')
  clear(@Body(new ZodValidationPipe(ClearDTO)) dto: ClearDTO) {
    return this.checks.clear(dto);
  }

  /** 修复某域名下的封面 */
  @Post('repair')
  repair(@Body(new ZodValidationPipe(RepairDTO)) dto: RepairDTO) {
    return this.checks.repair(dto);
  }

  /** 某域名下的影片，供换封面/清空前预览 */
  @Post('host-vods')
  hostVods(@Body(new ZodValidationPipe(HostVodsDTO)) dto: HostVodsDTO) {
    return this.checks.hostVods(dto);
  }
}
