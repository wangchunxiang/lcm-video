import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * 媒体查询的响应式布尔值。
 *
 * 只用来决定「渲染哪个组件形态」（桌面导航 / 手机抽屉），
 * 纯视觉差异一律交给 Tailwind 的断点前缀，不要在模板里用它控制样式。
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  let list: MediaQueryList | null = null;

  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches;
  };

  onMounted(() => {
    list = window.matchMedia(query);
    matches.value = list.matches;
    list.addEventListener('change', onChange);
  });

  onBeforeUnmount(() => {
    list?.removeEventListener('change', onChange);
    list = null;
  });

  return matches;
}

/** 手机断点：与 Tailwind 的 `sm`（640px）对齐，小于它算手机。 */
export function useIsMobile(): Ref<boolean> {
  return useMediaQuery('(max-width: 639px)');
}
