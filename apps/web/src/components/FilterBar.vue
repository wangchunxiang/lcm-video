<script setup lang="ts">
import { computed, ref } from 'vue';
import ChipRow from './ChipRow.vue';
import type { ChipOption } from './chip-option';
import Sheet from './ui/Sheet.vue';
import Button from './ui/Button.vue';

const props = defineProps<{
  types: { id: string; name: string; alias: string }[];
  years: number[];
  type: string;
  year: string;
  sort: string;
}>();

const emit = defineEmits<{
  'update:type': [value: string];
  'update:year': [value: string];
  'update:sort': [value: string];
}>();

const open = ref(false);

const typeOptions = computed<ChipOption[]>(() => [
  { value: '', label: '全部' },
  ...props.types.map((item) => ({ value: item.alias, label: item.name })),
]);
const yearOptions = computed<ChipOption[]>(() => [
  { value: '', label: '全部' },
  ...props.years.map((item) => ({ value: String(item), label: String(item) })),
]);
const sortOptions: ChipOption[] = [
  { value: 'time', label: '最近更新' },
  { value: 'new', label: '最新入库' },
];

const activeCount = computed(
  () => (props.type ? 1 : 0) + (props.year ? 1 : 0) + (props.sort !== 'time' ? 1 : 0),
);

function reset(): void {
  emit('update:type', '');
  emit('update:year', '');
  emit('update:sort', 'time');
}
</script>

<template>
  <!-- 桌面 / 平板：白卡片内联三行 -->
  <div class="mb-4 hidden flex-col gap-3 rounded-[10px] bg-surface p-5 shadow-card md:flex">
    <div v-if="types.length" class="flex items-start gap-3">
      <span class="w-11 shrink-0 pt-1.5 text-small text-ink-3">类型</span>
      <ChipRow
        :options="typeOptions"
        :model-value="type"
        @update:model-value="(value: string) => emit('update:type', value)"
      />
    </div>
    <div v-if="years.length" class="flex items-start gap-3">
      <span class="w-11 shrink-0 pt-1.5 text-small text-ink-3">年份</span>
      <ChipRow
        :options="yearOptions"
        :model-value="year"
        @update:model-value="(value: string) => emit('update:year', value)"
      />
    </div>
    <div class="flex items-start gap-3">
      <span class="w-11 shrink-0 pt-1.5 text-small text-ink-3">排序</span>
      <ChipRow
        :options="sortOptions"
        :model-value="sort"
        @update:model-value="(value: string) => emit('update:sort', value)"
      />
    </div>
  </div>

  <!-- 手机：筛选按钮 + 底部抽屉 -->
  <div class="mb-3 flex items-center gap-2 md:hidden">
    <Button size="sm" @click="open = true">
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M7 12h10M10 18h4" stroke-linecap="round" />
      </svg>
      筛选
      <span v-if="activeCount" class="rounded-pill bg-primary px-1.5 text-caption text-white">{{ activeCount }}</span>
    </Button>
    <Button v-if="activeCount" variant="ghost" size="sm" @click="reset">清除</Button>
  </div>

  <Sheet v-model:open="open" title="筛选" description="选择后立即生效" side="bottom">
    <div class="flex flex-col gap-4">
      <section v-if="types.length">
        <h3 class="mb-2 text-small font-medium text-ink-2">类型</h3>
        <ChipRow
          :options="typeOptions"
          :model-value="type"
          @update:model-value="(value: string) => emit('update:type', value)"
        />
      </section>
      <section v-if="years.length">
        <h3 class="mb-2 text-small font-medium text-ink-2">年份</h3>
        <ChipRow
          :options="yearOptions"
          :model-value="year"
          @update:model-value="(value: string) => emit('update:year', value)"
        />
      </section>
      <section>
        <h3 class="mb-2 text-small font-medium text-ink-2">排序</h3>
        <ChipRow
          :options="sortOptions"
          :model-value="sort"
          @update:model-value="(value: string) => emit('update:sort', value)"
        />
      </section>
    </div>

    <template #footer>
      <div class="flex gap-3">
        <Button class="flex-1" @click="reset">重置</Button>
        <Button variant="primary" class="flex-1" @click="open = false">完成</Button>
      </div>
    </template>
  </Sheet>
</template>
