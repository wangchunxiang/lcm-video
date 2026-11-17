import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue';

/**
 * 弹窗打开时锁住页面滚动，并补回滚动条宽度，避免页面右移一下。
 *
 * 关键在 `onScopeDispose` 里的复位：以前这段逻辑写在页面里，只在"关弹窗"时复位。
 * 用户开着弹窗点走（比如点推荐片、浏览器后退）时弹窗不会触发关闭，body 就被永久锁死，
 * 整个站滚不动。放在 composable 里，组件卸载时一定复位。
 */
export function useScrollLock(open: MaybeRefOrGetter<boolean>): void {
  let locked = false;

  function apply(next: boolean): void {
    if (next === locked) return;
    locked = next;
    if (next) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : '';
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  watch(() => toValue(open), apply, { immediate: true, flush: 'post' });
  onScopeDispose(() => apply(false));
}
