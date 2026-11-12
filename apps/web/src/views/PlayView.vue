<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import PlayerBox from '../components/PlayerBox.vue';

const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const current = computed(() => play.value?.current ?? 1);
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const prevEp = computed(() => (current.value > 1 ? current.value - 1 : 0));
const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));

let requestSeq = 0;

async function load(): Promise<void> {
  const seq = ++requestSeq;
  const vodId = String(route.params.id || '');
  const lineParam = typeof route.params.lineId === 'string' ? route.params.lineId : '';
  const epParam = Math.max(1, Number(route.params.ep) || 1);

  loading.value = true;
  error.value = '';
  try {
    // 先取线路列表（line=0），再按 URL 里的线路 id 换算成接口需要的 0 基下标。
    let result = await portal.play(vodId, { line: 0, ep: epParam });
    if (seq !== requestSeq) return;

    let lineIndex = 0;
    if (lineParam) {
      const found = result.lines.findIndex((item) => item.id === lineParam);
      if (found >= 0) lineIndex = found;
    }
    if (lineIndex !== 0) {
      result = await portal.play(vodId, { line: lineIndex, ep: epParam });
      if (seq !== requestSeq) return;
    }

    if (result.episodes.length && epParam > result.episodes.length) {
      result = await portal.play(vodId, { line: lineIndex, ep: result.episodes.length });
      if (seq !== requestSeq) return;
    }

    play.value = result;

    const canonicalLine = result.line.id;
    const canonicalEp = String(result.current);
    if (lineParam !== canonicalLine || String(route.params.ep ?? '') !== canonicalEp) {
      await router.replace({ name: 'play', params: { id: vodId, lineId: canonicalLine, ep: canonicalEp } });
    }
  } catch (e) {
    if (seq === requestSeq) {
      play.value = null;
      error.value = (e as Error).message || '播放页加载失败';
    }
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function selectLine(lineId: string): void {
  router.push({ name: 'play', params: { id: String(route.params.id), lineId, ep: '1' } });
}

function selectEp(index: number): void {
  if (!line.value || index === current.value) return;
  router.push({ name: 'play', params: { id: String(route.params.id), lineId: line.value.id, ep: String(index) } });
}

function onEnded(): void {
  if (player.value.autonext && nextEp.value) selectEp(nextEp.value);
}

watch(() => [route.params.id, route.params.lineId, route.params.ep], load, { immediate: true });

useSeo(() => ({
  title: vod.value
    ? `${vod.value.name} ${epItem.value?.name ?? ''} - ${line.value?.name ?? ''} - ${site.config.siteName}`
    : `在线播放 - ${site.config.siteName}`,
  description: vod.value?.remarks || site.config.siteSubtitle,
}));
</script>

<template>
  <div>
    <nav class="crumb">
      <RouterLink to="/">首页</RouterLink>
      <span>/</span>
      <RouterLink v-if="vod" :to="`/detail/${vod.id}`">{{ vod.name }}</RouterLink>
      <span v-if="vod">/</span>
      <span>{{ epItem?.name ?? '在线播放' }}</span>
    </nav>

    <p v-if="loading" class="loading-tip">加载中…</p>
    <p v-else-if="error" class="error-box">{{ error }}</p>

    <template v-else-if="play && vod && line">
      <div class="play-layout">
        <div>
          <PlayerBox
            :src="epItem?.url ?? ''"
            :parse-url="line.parseUrl"
            :poster="vod.cover"
            :autoplay="player.autoplay"
            :resume="player.resume"
            :resume-key="`${vod.id}:${line.id}`"
            @ended="onEnded"
          />

          <section class="play-info">
            <h1>{{ vod.name }} · {{ epItem?.name }}</h1>
            <p>当前线路：{{ line.name }} · 共 {{ episodes.length }} 集 · {{ vod.remarks || '高清' }}</p>
            <p><RouterLink :to="`/detail/${vod.id}`">查看影片详情 ›</RouterLink></p>
          </section>
        </div>

        <aside class="play-side">
          <div class="play-side-head">
            <RouterLink class="play-vod" :to="`/detail/${vod.id}`">{{ vod.name }}</RouterLink>
            <span class="play-side-title">选集（{{ episodes.length }}）</span>
          </div>

          <div class="line-pills">
            <button
              v-for="item in play.lines"
              :key="item.id"
              class="chip"
              :class="{ 'is-on': item.id === line.id }"
              type="button"
              @click="selectLine(item.id)"
            >
              {{ item.name }}
            </button>
          </div>

          <div class="ep-scroll">
            <div class="ep-grid">
              <button
                v-for="ep in episodes"
                :key="ep.index"
                class="ep-btn"
                :class="{ 'is-on': ep.index === current }"
                type="button"
                @click="selectEp(ep.index)"
              >
                {{ ep.name }}
              </button>
            </div>
          </div>

          <div class="play-nav">
            <button class="btn btn-sm" type="button" :disabled="!prevEp" @click="selectEp(prevEp)">上一集</button>
            <button class="btn btn-sm" type="button" :disabled="!nextEp" @click="selectEp(nextEp)">下一集</button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
