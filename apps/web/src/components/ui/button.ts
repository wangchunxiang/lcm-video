/**
 * 按钮的类名生成器：Button 组件与「长得像按钮的 RouterLink」共用一份。
 * 不引 cva/clsx，变体只有三档，直接拼字符串更直白。
 */
export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-pill border text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary font-semibold text-white hover:border-primary-strong hover:bg-primary-strong',
  outline: 'border-line bg-surface text-ink-2 hover:border-primary-line hover:text-primary',
  ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-[38px] px-5 text-body',
  sm: 'h-[30px] px-3 text-small',
};

export function buttonClass(options: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  const { variant = 'outline', size = 'md' } = options;
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;
}
