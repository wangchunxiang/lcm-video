import { IsString, Matches } from 'class-validator';

/** 只带 `id` 的动作入参：采集任务、采集记录、地址规则等。 */
export class IdDTO {
  @IsString({ message: 'id 必须是数字' })
  @Matches(/^\d+$/, { message: 'id 必须是数字' })
  id!: string;
}

/** 只带 `sourceId` 的动作入参：采集源、源站分类映射。 */
export class SourceIdDTO {
  @IsString({ message: '采集源 id 必须是数字' })
  @Matches(/^\d+$/, { message: '采集源 id 必须是数字' })
  sourceId!: string;
}
