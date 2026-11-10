import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'lcm:isPublic';

/** 标记不需要登录的接口（登录、探活、前台只读接口）。 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
