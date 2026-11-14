<script lang="ts" setup>
import { XTime } from '@novelia/web-kit';
import { StarFilled } from '@vicons/material';
import { createReusableTemplate } from '@vueuse/core';

import type { WebNovelOutlineDto } from '@/model/WebNovel';
import { FavoredRepo } from '@/stores';
import { WebUtil } from '@/util/web';

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const favoredTitleMap = computed(() => {
  if (!favoreds.value?.web) {
    return new Map<string, string>();
  }
  return favoreds.value.web.reduce((map, favored) => {
    map.set(favored.id, favored.title);
    return map;
  }, new Map<string, string>());
});

const [DefineTag, ReuseTag] = createReusableTemplate<{
  tag: string;
  isAttention: boolean;
}>();

const props = defineProps<{
  simple?: boolean;
  items: WebNovelOutlineDto[];
  selectable?: boolean;
}>();

const selectedIds = ref<string[]>([]);
const selectedNovels = computed(() =>
  props.items.filter(({ providerId, novelId }) =>
    selectedIds.value.includes(`${providerId}/${novelId}`),
  ),
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
  return props.items.filter((it) =>
    selectedIds.value.includes(`${it.providerId}/${it.novelId}`),
  );
};

defineExpose({
  selectedNovels,
  getSelectedNovels,
  selectAll: () => {
    selectedIds.value = props.items.map(
      (it) => `${it.providerId}/${it.novelId}`,
    );
  },
  invertSelection: () => {
    selectedIds.value = props.items
      .map((it) => `${it.providerId}/${it.novelId}`)
      .filter((it) => !selectedIds.value.includes(it));
  },
});
</script>

<template>
  <DefineTag v-slot="{ tag, isAttention }">
    <router-link :to="`/novel?query=${tag}\$`">
      <span class="text-muted">
        <component :is="isAttention ? 'b' : 'span'">
          {{ isAttention ? tag : WebUtil.tryTranslateKeyword(tag) }}
        </component>
      </span>
    </router-link>
    /
  </DefineTag>

  <div class="divide-y divide-default leading-[1.6] text-default text-sm">
    <div
      class="relative min-w-0 py-3"
      v-for="item of items"
      :key="`${item.providerId}/${item.novelId}`"
    >
      <div class="flex flex-col">
        <ULink :to="`/novel/${item.providerId}/${item.novelId}`">
          {{ item.titleJp }}
        </ULink>

        <span v-if="item.titleZh">
          {{ item.titleZh }}
        </span>

        <ULink
          v-if="!simple"
          :href="WebUtil.buildNovelUrl(item.providerId, item.novelId)"
        >
          {{ item.providerId + '.' + item.novelId }}
        </ULink>

        <span class="text-muted" v-if="item.extra">
          {{ item.extra }}
        </span>

        <span class="text-muted" v-if="!simple">
          <ReuseTag
            v-for="attention in item.attentions.sort()"
            :key="attention"
            :tag="attention"
            :is-attention="true"
          />
          <ReuseTag
            v-for="keyword in item.keywords"
            :key="keyword"
            :tag="keyword"
            :is-attention="false"
          />
        </span>

        <span class="text-muted" v-if="item.total">
          {{ item.type ? item.type + ' / ' : '' }}
          总计 {{ item.total }} / 有道 {{ item.youdao }} / GPT {{ item.gpt }} /
          Sakura {{ item.sakura }} /
        </span>

        <span class="text-muted">
          <template v-if="item.favored">
            <span class="text-warning" v-if="item.favored">
              <StarFilled
                class="inline-block size-[10px] align-baseline"
                aria-hidden="true"
              />
            </span>
            收藏于：{{ favoredTitleMap.get(item.favored) || '未知收藏夹' }} /
          </template>
          <template v-if="item.updateAt">
            本站更新于
            <XTime :time="item.updateAt * 1000" preset="relative" />
            /
          </template>
          <template v-if="item.lastReadAt">
            <XTime :time="item.lastReadAt * 1000" preset="relative" />
            看过 /
          </template>
        </span>
      </div>

      <slot name="action" v-bind="item" />

      <c-select-overlay
        v-if="selectable"
        :checked="selectedIds.includes(`${item.providerId}/${item.novelId}`)"
        @update:checked="
          (checked: boolean) =>
            toggleNovelSelect(`${item.providerId}/${item.novelId}`, checked)
        "
      />
    </div>
  </div>
</template>
