<script lang="ts" setup>
import { StarFilled } from '@vicons/material';

import type { WenkuNovelOutlineDto } from '@/model/WenkuNovel';

const props = defineProps<{
  items: WenkuNovelOutlineDto[];
  selectable?: boolean;
}>();

const selectedIds = ref<string[]>([]);
const selectedNovels = computed(() =>
  props.items.filter(({ id }) => selectedIds.value.includes(id)),
);

watch(
  () => props.selectable,
  (selectable) => {
    if (selectable !== false) {
      selectedIds.value = [];
    }
  },
);
const toggleNovelSelect = (novel: string, selected: boolean) => {
  if (selected) {
    selectedIds.value.push(novel);
  } else {
    selectedIds.value = selectedIds.value.filter((it) => it != novel);
  }
};

const getSelectedNovels = () => {
  return props.items.filter((it) => selectedIds.value.includes(it.id));
};

defineExpose({
  selectedNovels,
  getSelectedNovels,
  selectAll: () => {
    selectedIds.value = props.items.map((it) => it.id);
  },
  invertSelection: () => {
    selectedIds.value = props.items
      .map((it) => it.id)
      .filter((it) => !selectedIds.value.includes(it));
  },
});
</script>

<template>
  <div class="@container w-full">
    <div
      class="grid grid-cols-2 gap-3 @[500px]:grid-cols-3 @[800px]:grid-cols-4"
    >
      <div v-for="item in items" :key="item.id" class="min-w-0">
        <div class="relative">
          <router-link :to="`/wenku/${item.id}`">
            <ImageCard
              :src="item.cover"
              :title="item.titleZh ? item.titleZh : item.title"
            >
              <template #prefix>
                <span class="text-warning" v-if="item.favored">
                  <StarFilled
                    class="inline-block size-4 align-baseline"
                    aria-hidden="true"
                  />
                </span>
              </template>
            </ImageCard>
          </router-link>

          <c-select-overlay
            v-if="selectable"
            :checked="selectedIds.includes(item.id)"
            @update:checked="
              (checked: boolean) => toggleNovelSelect(item.id, checked)
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>
