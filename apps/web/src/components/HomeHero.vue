<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { VodCard as VodCardData } from '../api/portal';
import Container from './layout/Container.vue';

/**
 * 首页 hero：通栏大图轮播。
 *
 * 通栏由首页路由的 `meta.fullBleed` + 这里的 100% 宽承担；文字与指示条再收进 Container，
 * 所以左右边界与下方区块仍然对齐。
 */
const props = defineProps<{
  items: VodCardData[];
}>();

/** 轮播间隔，毫秒 */
const INTERVAL = 7000;


const current = ref(0);
/** 两图层交叉淡入：写入隐藏层再翻转 opacity，避免切图时闪黑 */
const layers = ref<Array<{ src: string; on: boolean }>>([
  { src: '', on: false },
  { src: '', on: false },
]);
let visible = 0;
let timer: number | null = null;

const hero = computed<VodCardData | undefined>(() => props.items[current.value]);
const metaParts = computed<string[]>(() => {
  const it = hero.value;
  if (!it) return [];
  // 只留「是什么、哪年的、哪国的、更到哪」，不显示总集数（用户明确不要）
  return [it.categoryName, it.year ? String(it.year) : '', it.area, it.remarks].filter(
    (part) => part !== '',
  );
});

function show(index: number): void {
  const it = props.items[index];
  if (!it) return;
  const hidden = visible === 0 ? 1 : 0;
  const outgoing = layers.value[visible] ?? { src: '', on: false };
  layers.value[hidden] = { src: it.cover, on: true };
  layers.value[visible] = { src: outgoing.src, on: false };
  visible = hidden;
  current.value = index;
}

function stop(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function start(): void {
  stop();
  if (props.items.length > 1) timer = window.setInterval(next, INTERVAL);
}

function next(): void {
  show((current.value + 1) % props.items.length);
}

/** 点指示条：立即切到该部，并重置计时，避免刚点完就被自动切走 */
function pick(index: number): void {
  show(index);
  start();
}

onMounted(() => {
  if (!props.items.length) return;
  show(0);
  start();
});

watch(
  () => props.items,
  () => {
    visible = 0;
    layers.value = [
      { src: '', on: false },
      { src: '', on: false },
    ];
    current.value = 0;
    if (!props.items.length) {
      stop();
      return;
    }
    show(0);
    start();
  },
);

onBeforeUnmount(stop);
</script>

<template>
  <section
    v-if="hero"
    class="hero relative w-full overflow-hidden bg-surface"
    @mouseenter="stop"
    @mouseleave="start"
  >
    <div
      v-for="(layer, index) in layers"
      :key="index"
      class="absolute inset-0 bg-cover [background-position:50%_28%] transition-opacity duration-700 ease-out"
      :class="layer.on ? 'opacity-100' : 'opacity-0'"
      :style="layer.src ? { backgroundImage: `url(${layer.src})` } : undefined"
      aria-hidden="true"
    />
    <!-- 遮罩：左侧压暗给文字留安全区，底部接到页面底色 -->
    <div
      class="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,12,15,0.94)_3%,rgba(10,12,15,0.85)_36%,rgba(10,12,15,0.28)_66%,rgba(10,12,15,0.05)_88%),linear-gradient(0deg,#0a0c0f_0%,rgba(10,12,15,0)_48%)]"
      aria-hidden="true"
    />

    <!-- 整块当详情入口：铺一层透明链接盖住画面；文字层不吃点击，指示条单独可点 -->
    <RouterLink
      :to="`/detail/${hero.id}`"
      class="absolute inset-0 z-[1] cursor-pointer"
      :aria-label="`查看《${hero.name}》详情`"
    />
    <div class="pointer-events-none absolute inset-x-0 bottom-[52px] z-10">
      <Container>
        <div class="flex items-end justify-between gap-8">
          <!-- 文字列吃满剩余宽度：只有右下指示条是不可压缩的，其余全给标题 -->
          <div class="flex min-w-0 flex-1 flex-col gap-4">
            <Transition name="hero-text" mode="out-in">
              <div class="flex flex-col gap-2">
                <h1 class="text-[clamp(34px,4vw,58px)] leading-[1.06] font-extrabold tracking-[-0.025em] text-ink">
                  {{ hero.name }}
                </h1>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
                  <template v-for="(part, index) in metaParts" :key="part">
                    <span v-if="index > 0" class="h-[3px] w-[3px] rounded-pill bg-ink-3" aria-hidden="true" />
                    <span>{{ part }}</span>
                  </template>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 右下：只有指示条，一行右对齐；点哪条切哪部，不跳转 -->
          <div class="pointer-events-auto hidden items-center gap-2 md:flex">
            <button
              v-for="(item, index) in items"
              :key="item.id"
              type="button"
              class="h-[3px] cursor-pointer rounded-pill transition-all duration-200"
              :class="index === current ? 'w-9 bg-white' : 'w-6 bg-white/25 hover:bg-white/50'"
              :aria-label="`第 ${index + 1} 部：${item.name}`"
              :aria-current="index === current"
              @click="pick(index)"
            />
          </div>
        </div>
      </Container>
    </div>
  </section>
</template>

<style scoped>
/* 高度走 tokens：桌面 min(600px, 68vh)；手机上压到 440px，别把首屏全占满 */
.hero {
  height: var(--hero-h);
}

@media (max-width: 640px) {
  .hero {
    height: min(440px, 62vh);
  }
}

.hero-text-enter-active,
.hero-text-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.hero-text-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.hero-text-leave-to {
  opacity: 0;
}
</style>
