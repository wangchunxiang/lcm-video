import { ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 搜索框里的「草稿词」：顶栏和搜索页共用同一套行为。
 *
 * 输入框不能直接绑 `route.query.wd`——用户打字时地址栏不该跟着变，回车/点搜索才提交。
 * 所以本地留一份草稿，路由上的 `wd` 变了（浏览器前进后退、点分类跳转）再把草稿同步回来。
 * 两处各写一遍这段就变成两份「谁是真相」的注释，这里收成一份。
 */
export function useKeywordDraft(): { keyword: Ref<string>; submit: () => void } {
  const route = useRoute();
  const router = useRouter();
  const keyword = ref('');

  watch(
    () => route.query.wd,
    (value) => {
      keyword.value = typeof value === 'string' ? value : '';
    },
    { immediate: true },
  );

  /** 提交草稿：空词不跳（顶栏展开态要靠调用方自己收回） */
  function submit(): void {
    const wd = keyword.value.trim();
    if (!wd) return;
    void router.push({ name: 'search', query: { wd } });
  }

  return { keyword, submit };
}
