/** 解析后的 5 段式 cron：每段是取值集合，`*Restricted` 表示该段是否被显式限定。 */
export interface CronParts {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  week: Set<number>;
  dayRestricted: boolean;
  weekRestricted: boolean;
}
