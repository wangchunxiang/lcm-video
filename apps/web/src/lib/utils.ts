import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 class：clsx 处理条件，tailwind-merge 处理同类工具类的覆盖。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
