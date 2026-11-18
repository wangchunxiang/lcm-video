<template>
  <!--
    线路 tab + 选集网格骨架。
    格距、格子高度、列数与详情/播放页完全一致；集数按片库常见值（约 20 集）占位，
    超长番剧仍由 --ep-max-h 封顶，比按上限画满 10 行更接近真实高度。
  -->
  <section>
    <div class="mb-4 flex items-end gap-4 border-b border-line">
      <div class="flex min-w-0 flex-1 gap-4 overflow-hidden py-2 sm:gap-8">
        <div
          v-for="index in 4"
          :key="index"
          class="h-[22px] w-16 flex-none animate-pulse rounded bg-surface-2"
        />
      </div>
      <div class="h-[22px] w-8 flex-none animate-pulse rounded bg-surface-2" />
    </div>

    <!--
      20 格 ≈ 片库里有剧集的影片中位集数（约 20 集）：xl 10 列就是 2 行，
      窄屏按 4/6/8 列自然折成 5/4/3 行，和常见详情页的选集高度接近。
      不按 --ep-max-h 的 10 行画满：那个上限是给超长番剧滚动用的，多数页面远不到。
    -->
    <div class="max-h-[var(--ep-max-h)] overflow-hidden">
      <div class="grid grid-cols-4 gap-[var(--ep-gap)] sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        <div
          v-for="index in 20"
          :key="index"
          class="h-[var(--ep-cell-h)] animate-pulse rounded bg-surface-2"
        />
      </div>
    </div>
  </section>
</template>
