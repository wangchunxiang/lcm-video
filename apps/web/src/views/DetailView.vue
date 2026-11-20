<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import qrcode from 'qrcode-generator';
import { isAbortError, portal, type EpisodeItem, type VodDetail } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { setPageCategoryId } from '../composables/usePageCategoryId';
import { useScrollLock } from '../composables/useScrollLock';
import { useEpisodeLayout } from '../composables/useEpisodeLayout';
import VodGrid from '../components/VodGrid.vue';
import Container from '../components/layout/Container.vue';
import GridSkeleton from '../components/ui/GridSkeleton.vue';
import EpisodeSkeleton from '../components/ui/EpisodeSkeleton.vue';
import Skeleton from '../components/ui/Skeleton.vue';

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id || ''));
const data = ref<VodDetail | null>(null);
const loading = ref(true);
const error = ref('');
const episodes = ref<EpisodeItem[]>([]);
const epLoading = ref(false);
const introOpen = ref(false);

/**
 * 手机观看：二维码里放的是「当前地址」（详情页地址），手机扫码就能打开同一部影片，
 * 不用手动输 URL。地址在打开弹窗时取一次，页面内不会再变，避免渲染中反复读 location。
 */
const qrOpen = ref(false);
const qrUrl = ref('');

/*
 * qrcode-generator 自带的 stringToBytes 按 latin1 取字节（charCodeAt & 0xff），URL 里带中文或其它
 * 非 ASCII 字符时会被截断成乱码；换成 UTF-8 编码后扫码才能还原原文。
 * 注意 ESM 构建里没有 CJS 版的 stringToBytesFuncs['UTF-8']，只能直接覆盖 stringToBytes。
 */
qrcode.stringToBytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/** 二维码用 SVG：矢量图形，投到平板上也不糊；0 = 按内容自动选版本，M 级容错约 15% */
const qrSvg = computed(() => {
  if (!qrUrl.value) return '';
  try {
    const code = qrcode(0, 'M');
    code.addData(qrUrl.value, 'Byte');
    code.make();
    // scalable：只给 viewBox 不给宽高，交给 CSS 撑满容器；内容只有几何图形，不含 URL 文本，v-html 无注入风险
    return code.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    return '';
  }
});

const vod = computed(() => data.value?.vod ?? null);
const lines = computed(() => data.value?.lines ?? []);

/**
 * 当前选中的线路只存在页面里（不进 URL）：地址栏保持 `/detail/:id`，
 * 点线路 tab 不产生导航，刷新或从别处回来默认第一条线路。
 */
const selectedLineId = ref('');

const selectedLine = computed(() => {
  if (!lines.value.length) return null;
  return lines.value.find((line) => line.id === selectedLineId.value) ?? lines.value[0];
});

/** 详情数据就绪（或换片）后默认选第一条线路 */
watch(
  lines,
  (list) => {
    selectedLineId.value = list[0]?.id ?? '';
  },
  { immediate: true },
);

/** 选集排序：倒序 = 最新集在前，偏好存 localStorage（长番追更常用） */
const EP_ORDER_KEY = 'lcm:ep-order';
const epDesc = ref(false);
try {
  epDesc.value = localStorage.getItem(EP_ORDER_KEY) === 'desc';
} catch {
  epDesc.value = false;
}

const episodesShown = computed(() => (epDesc.value ? [...episodes.value].reverse() : episodes.value));
const epsGridRef = ref<HTMLDivElement | null>(null);
/** 小屏下按集名宽度动态跨列（1–4 格），PC 上一律 1 格 */
/** 小屏下若有一格放不下的集名，整块改用 flex-wrap 自然宽度；PC 上恒为 grid */
const { layout } = useEpisodeLayout(episodesShown, epsGridRef);

function toggleEpOrder(): void {
  epDesc.value = !epDesc.value;
  try {
    localStorage.setItem(EP_ORDER_KEY, epDesc.value ? 'desc' : 'asc');
  } catch {
    /* 隐私模式写不进去，忽略 */
  }
}

const categoryName = computed(() => vod.value?.categoryName ?? '影片');
const poster = computed(() => vod.value?.cover || '/img/poster-placeholder.svg');
const intro = computed(() => vod.value?.content?.trim() ?? '');

/**
 * 摘要截断：先看整段能否在 2 行内完整放下——能就原样全显，末尾不要「详情」；
 * 放不下才算「两行内能放下多少字 + 省略号 + 详情」，让按钮紧跟最后一个字。
 * 按钮只负责打开详情弹窗。
 */
const introRef = ref<HTMLElement | null>(null);
const introCut = ref('');
const introLong = ref(false);
const introShown = computed(() => (introLong.value ? `${introCut.value}…` : intro.value));

function fitIntro(): void {
  const el = introRef.value;
  const full = intro.value;
  if (!el || !full) {
    introCut.value = '';
    introLong.value = false;
    return;
  }
  const cs = getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight) || 24;
  const fontSize = parseFloat(cs.fontSize) || 14;
  const maxHeight = lineHeight * 2 + 1;

  const probe = document.createElement('p');
  probe.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    `width:${el.clientWidth}px`,
    `font:${cs.font}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    `white-space:${cs.whiteSpace}`,
  ].join(';');
  document.body.appendChild(probe);

  // withLink=true 时把「…详情」也一起量进去，保证按钮不换行、不顶到右边界；
  // withLink=false 时不加任何尾巴，用来判断整段本身是否已经能完整显示。
  const fits = (text: string, withLink: boolean): boolean => {
    probe.replaceChildren();
    probe.textContent = withLink ? `${text}…` : text;
    if (withLink) {
      const tail = document.createElement('span');
      tail.style.fontSize = `${fontSize}px`;
      tail.style.marginLeft = '4px';
      tail.textContent = '详情';
      // 末尾再留 2 个字宽的空白，按钮就不会顶到内容区右边界
      const spacer = document.createElement('span');
      spacer.style.display = 'inline-block';
      spacer.style.width = `${fontSize * 2}px`;
      probe.append(tail, spacer);
    }
    return probe.scrollHeight <= maxHeight;
  };

  if (fits(full, false)) {
    // 已经完全显示了，就不出「详情」链接
    introLong.value = false;
    introCut.value = full;
  } else {
    introLong.value = true;
    let lo = 0;
    let hi = full.length;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(full.slice(0, mid), true)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    introCut.value = full.slice(0, best);
  }
  probe.remove();
  lastFitWidth = el.clientWidth;
}

let fitTimer: number | undefined;
let lastFitWidth = 0;

/** 宽度没变就不用重算；拖动窗口时 120ms 防抖（和 v2 一致） */
function onResize(): void {
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => {
    const width = introRef.value?.clientWidth ?? 0;
    if (width > 0 && width !== lastFitWidth) fitIntro();
  }, 120);
}

function closeIntro(): void {
  introOpen.value = false;
}

function openQr(): void {
  qrUrl.value = window.location.href;
  qrOpen.value = true;
}

function closeQr(): void {
  qrOpen.value = false;
}

/** 两个弹窗共用一套「Esc 关全部 / 锁滚动」逻辑，只用一个 watch 避免互相覆盖 body 样式 */
const anyModalOpen = computed(() => introOpen.value || qrOpen.value);

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  introOpen.value = false;
  qrOpen.value = false;
}

// 弹窗锁滚动交给 composable：组件卸载时会复位，开着弹窗离开页面也不会把全站锁死
useScrollLock(anyModalOpen);

watch(intro, async () => {
  await nextTick();
  fitIntro();
});

onMounted(() => {
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeydown);
  // 字体加载完成后宽高会变一次，再量一遍更稳（系统字体通常已就绪，开销可忽略）
  void document.fonts?.ready.then(fitIntro);
  // 旧链接里的 ?line= / ?ep= 已不再使用（线路改存在页面里），清掉让地址栏保持干净
  if (route.query.line !== undefined || route.query.ep !== undefined) {
    const rest = { ...route.query };
    delete rest.line;
    delete rest.ep;
    void router.replace({ name: 'detail', params: { id: id.value }, query: rest });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onKeydown);
  window.clearTimeout(fitTimer);
  detailController?.abort();
  epController?.abort();
});

function selectLine(lineId: string): void {
  selectedLineId.value = lineId;
}

/** 在飞选集请求：快速连点线路时把上一个断掉，先发后到的响应不会再覆盖 */
let epController: AbortController | null = null;

async function loadEpisodes(): Promise<void> {
  epController?.abort();
  if (!selectedLine.value || !data.value) {
    episodes.value = [];
    return;
  }
  const index = lines.value.findIndex((line) => line.id === selectedLine.value?.id);
  if (index < 0) return;

  const controller = new AbortController();
  epController = controller;
  epLoading.value = true;
  try {
    const result = await portal.play(id.value, { line: index, ep: 1 }, { signal: controller.signal });
    episodes.value = result.episodes;
  } catch (e) {
    if (isAbortError(e)) return;
    episodes.value = [];
  } finally {
    if (!controller.signal.aborted) epLoading.value = false;
  }
}

let detailController: AbortController | null = null;

async function load(): Promise<void> {
  detailController?.abort();
  const controller = new AbortController();
  detailController = controller;
  loading.value = true;
  error.value = '';
  data.value = null;
  episodes.value = [];
  introOpen.value = false;
  qrOpen.value = false;
  try {
    const result = await portal.detail(id.value, { signal: controller.signal });
    data.value = result;
    // 小屏底栏靠它高亮所属的一级分类（URL 里只有影片 id）
    setPageCategoryId(result.vod.categoryId);
  } catch (e) {
    if (isAbortError(e)) return;
    error.value = (e as Error).message || '影片加载失败';
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}

watch(id, load, { immediate: true });
watch(() => selectedLine.value?.id, loadEpisodes);

useSeo(() => ({
  title: vod.value
    ? `${vod.value.name} - ${categoryName.value} - ${site.config.siteName}`
    : `影片详情 - ${site.config.siteName}`,
  description: (intro.value || vod.value?.remarks || site.config.siteSubtitle).slice(0, 120),
}));
</script>

<template>
  <div>
    <!-- 骨架按真实版式 1:1 摆：海报 + 标签/四行信息 + 按钮 + 线路/选集 + 相关推荐 -->
    <template v-if="loading">
      <Container>
        <div class="flex gap-8 py-4 max-lg:flex-col max-lg:gap-4">
          <Skeleton class="aspect-[2/3] w-[240px] flex-none self-start rounded-md max-lg:w-[200px]" />
          <div class="flex min-w-0 flex-1 flex-col justify-between gap-4">
            <div class="flex flex-col gap-4">
              <Skeleton class="h-7 w-2/3" />
              <!-- 又名平均 17 字，窄屏会折成两行 -->
              <Skeleton class="h-[45px] w-1/3" />
              <div class="flex flex-wrap gap-2">
                <Skeleton v-for="index in 3" :key="index" class="h-7 w-14" />
              </div>
              <!-- 导演 / 演员 / 上映 / 简介：简介固定截两行，演员行按窄屏常见折行数占位 -->
              <div class="grid gap-2">
                <Skeleton class="h-[22px] w-full" />
                <Skeleton class="h-[66px] w-full sm:h-[44px] lg:h-[22px]" />
                <Skeleton class="h-[22px] w-full" />
                <Skeleton class="h-[53px] w-full" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <Skeleton class="h-[38px] w-24" />
              <Skeleton class="h-[38px] w-24" />
            </div>
          </div>
        </div>
      </Container>

      <Container class="pt-4">
        <EpisodeSkeleton class="pb-4" />

        <!-- 相关推荐固定 8 部（后端 take: 8），大屏正好一行、窄屏自动折行 -->
        <section>
          <div class="mb-4 flex h-[35px] items-center">
            <Skeleton class="h-6 w-24" />
          </div>
          <GridSkeleton :count="8" />
        </section>
      </Container>
    </template>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else-if="vod">
      <!-- 顶部横幅：封面放大虚化垫底，前面压渐变接到页面底色；横幅通栏，内容仍收进 Container -->
      <section class="relative isolate z-10">
        <!-- 只裁剪背景层（blur 会外溢）；内容层不裁剪，简介浮层才能盖到下面的区块上 -->
        <div class="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            v-if="vod.cover"
            class="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-2xl max-lg:blur-lg"
            :style="{ backgroundImage: `url(${vod.cover})` }"
          />
          <div
            class="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,12,15,0.55),rgba(10,12,15,0.72)_55%,var(--bg))]"
          />
        </div>

        <Container class="relative">
          <div class="flex gap-8 py-4 max-lg:flex-col max-lg:gap-4">
        <img
          :src="poster"
          :alt="vod.name"
          class="aspect-[2/3] w-[240px] flex-none self-start rounded-md bg-surface-2 object-fill max-lg:w-[200px]"
        />

        <div class="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div class="flex flex-col gap-4">
            <h1 class="text-page leading-tight font-bold text-ink">{{ vod.name }}</h1>
            <p v-if="vod.subName" class="text-body text-ink-2">{{ vod.subName }}</p>

            <div class="flex flex-wrap gap-2">
              <span v-if="vod.year" class="rounded bg-primary-weak px-2 py-1 text-caption text-primary">
                {{ vod.year }}
              </span>
              <span v-if="vod.categoryName" class="rounded bg-surface-2 px-2 py-1 text-caption text-ink-2">
                {{ vod.categoryName }}
              </span>
              <span v-if="vod.remarks" class="rounded bg-surface-2 px-2 py-1 text-caption text-ink-2">
                {{ vod.remarks }}
              </span>
            </div>

            <dl class="grid gap-2 text-body">
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">导演</dt>
                <dd class="text-ink-2">{{ vod.director || '—' }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">演员</dt>
                <dd class="text-ink-2">{{ vod.actor || '—' }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">上映</dt>
                <dd class="text-ink-2">{{ vod.releaseDate }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">简介</dt>
                <dd class="min-w-0 flex-1">
                  <p ref="introRef" class="whitespace-pre-wrap leading-[1.9] text-ink-2">{{ introShown }}<button
                      v-if="introLong"
                      type="button"
                      class="ml-1 inline cursor-pointer text-body text-primary transition hover:text-ink"
                      @click.stop="introOpen = true"
                    >详情</button></p>
                </dd>
              </div>
            </dl>
          </div>

          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-if="selectedLine"
              :to="`/play/${vod.id}/${selectedLine.id}/1`"
              class="inline-flex h-[38px] items-center rounded-md bg-primary px-4 text-body text-white transition hover:bg-primary-strong"
            >
              立即播放
            </RouterLink>
            <button
              type="button"
              class="inline-flex h-[38px] cursor-pointer items-center rounded-md border border-line bg-surface-2 px-4 text-body text-ink-2 transition hover:border-ink-3/50 hover:text-ink"
              @click="openQr"
            >
              手机观看
            </button>
          </div>
          </div>
          </div>
        </Container>
      </section>

      <Container class="pt-4">
        <section v-if="lines.length" class="pb-4">
        <div class="mb-4 flex items-end gap-4 border-b border-line">
          <div
            class="-mb-px flex min-w-0 flex-1 gap-4 overflow-x-auto sm:gap-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              v-for="line in lines"
              :id="`line-tab-${line.id}`"
              :key="line.id"
              type="button"
              class="flex-none cursor-pointer whitespace-nowrap pb-2 pt-2 text-body transition"
              :class="
                selectedLine?.id === line.id
                  ? 'text-primary shadow-[inset_0_-2px_0_var(--color-primary)]'
                  : 'text-ink-2 hover:text-ink'
              "
              @click="selectLine(line.id)"
            >
              {{ line.name }}
            </button>
          </div>
          <button
            type="button"
            class="-mb-px flex-none cursor-pointer pb-2 pt-2 text-small text-ink-3 transition hover:text-ink"
            :title="epDesc ? '当前倒序，点击切回正序' : '当前正序，点击切换为倒序'"
            @click="toggleEpOrder"
          >
            {{ epDesc ? '倒序' : '正序' }}
          </button>
        </div>

        <div
          v-if="episodesShown.length"
          class="max-h-[var(--ep-max-h)] overflow-y-auto transition-opacity"
          :class="epLoading ? 'pointer-events-none opacity-40' : ''"
        >
          <div
            ref="epsGridRef"
            :class="
              layout === 'flow'
                ? 'flex flex-wrap gap-[var(--ep-gap)]'
                : 'grid grid-cols-4 gap-[var(--ep-gap)] sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
            "
          >
            <RouterLink
              v-for="ep in episodesShown"
              :key="ep.index"
              :to="`/play/${vod.id}/${selectedLine?.id}/${ep.index}`"
              :title="ep.name"
              class="h-[var(--ep-cell-h)] truncate rounded bg-surface-2 text-center text-caption leading-[var(--ep-cell-h)] text-ink-2 transition hover:bg-surface-3 hover:text-ink"
              :class="layout === 'flow' ? 'max-w-full px-3' : ''"
            >
              {{ ep.name }}
            </RouterLink>
          </div>
        </div>
        <p v-else-if="epLoading" class="py-8 text-center text-body text-ink-3">剧集加载中…</p>
        <p v-else class="py-8 text-center text-body text-ink-3">该线路暂无剧集</p>
      </section>

      <section v-if="data?.related.length">
        <div class="mb-4 flex items-baseline">
          <h2 class="text-section font-bold text-ink">相关推荐</h2>
        </div>
        <VodGrid :items="data.related" />
      </section>
      </Container>
    </template>

    <!-- 简介弹窗：640px 居中 + 遮罩，关闭＝按钮 / 点遮罩 / Esc -->
    <Teleport to="body">
      <div v-if="introOpen" class="fixed inset-0 z-40 bg-scrim" @click="closeIntro" />
      <div
        v-if="introOpen"
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[70vh] w-[min(640px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
      >
        <header class="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
          <h2 class="text-body font-semibold text-ink">详细介绍</h2>
          <button
            type="button"
            class="cursor-pointer text-small text-primary transition hover:text-ink"
            @click="closeIntro"
          >
            关闭
          </button>
        </header>
        <div class="overflow-y-auto whitespace-pre-wrap px-4 py-4 leading-[1.9] text-ink-2">{{ intro }}</div>
      </div>
    </Teleport>

    <!-- 手机观看：二维码内容是当前地址，关闭＝按钮 / 点遮罩 / Esc -->
    <Teleport to="body">
      <div v-if="qrOpen" class="fixed inset-0 z-40 bg-scrim" @click="closeQr" />
      <div
        v-if="qrOpen"
        class="fixed left-1/2 top-1/2 z-50 w-[min(320px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-pop"
      >
        <header class="mb-3 flex items-center justify-between gap-4">
          <h2 class="text-body font-semibold text-ink">手机观看</h2>
          <button
            type="button"
            class="cursor-pointer text-small text-primary transition hover:text-ink"
            @click="closeQr"
          >
            关闭
          </button>
        </header>
        <!-- 二维码本体是黑块白底，这里必须给白底：暗色主题下黑底二维码扫不出来 -->
        <!-- eslint-disable vue/no-v-html --
             内容是本机用 qrcode 生成、只含 path/rect 的 SVG 字符串，不含接口数据。
             用 disable/enable 包围而不是 disable-next-line：v-html 在这个多行标签的第三行。 -->
        <div
          v-if="qrSvg"
          class="rounded-md bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          v-html="qrSvg"
        />
        <!-- eslint-enable vue/no-v-html -->
        <p v-else class="rounded-md bg-surface-2 px-4 py-8 text-center text-body text-ink-3">二维码生成失败</p>
      </div>
    </Teleport>
  </div>
</template>
