import { createDataSourceOptions } from '../config/typeorm.config';
import { DataSource } from 'typeorm';

/**
 * 供 TypeORM CLI / 一次性脚本使用的单例连接（Nest 内部走 TypeOrmModule，不读这里）。
 *
 * 用法：`node --env-file=.env dist/database/data-source.js` 之类的脚本 import 后手动初始化。
 */
export const AppDataSource = new DataSource(
  createDataSourceOptions(process.env.DATABASE_URL ?? ''),
);
