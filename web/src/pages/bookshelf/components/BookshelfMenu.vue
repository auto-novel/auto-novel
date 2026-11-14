<script lang="ts" setup>
import { FavoredRepo, useWhoamiStore } from '@/stores';
import BookshelfMenuItem from './BookshelfMenuItem.vue';

defineProps<{ value: string }>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const groups = computed(() => {
  const localGroup = {
    type: 'local' as const,
    title: '本地小说',
    items: favoreds.value.local,
  };
  if (!whoami.value.isSignedIn) {
    return [localGroup];
  }

  const withAll = (items: { id: string; title: string }[]) =>
    items.length > 1 ? [{ id: 'all', title: '全部' }, ...items] : items;

  return [
    {
      type: 'web' as const,
      title: '网络小说',
      items: withAll(favoreds.value.web),
    },
    {
      type: 'wenku' as const,
      title: '文库小说',
      items: withAll(favoreds.value.wenku),
    },
    localGroup,
  ];
});
</script>

<template>
  <nav aria-label="收藏夹" class="min-w-0 overflow-y-auto pb-1.5">
    <section
      v-for="group in groups"
      :key="group.type"
      class="border-default px-2 py-2 first:pt-0 not-first:border-t"
    >
      <h2 class="px-3 py-2 text-sm font-normal text-muted">
        {{ group.title }}
      </h2>
      <ul class="m-0 list-none space-y-1 p-0">
        <li v-for="item in group.items" :key="`${group.type}/${item.id}`">
          <BookshelfMenuItem
            :id="item.id"
            :title="item.title"
            :type="group.type"
            :active="value === `${group.type}/${item.id}`"
          />
        </li>
      </ul>
    </section>
  </nav>
</template>
