<script lang="ts" setup>
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
      <n-text depth="3">
        <component :is="isAttention ? 'b' : 'span'">
          {{ isAttention ? tag : WebUtil.tryTranslateKeyword(tag) }}
        </component>
      </n-text>
    </router-link>
    /
  </DefineTag>

  <n-list>
    <n-list-item
      v-for="item of items"
      :key="`${item.providerId}/${item.novelId}`"
    >
      <n-flex vertical :size="0">
        <c-a :to="`/novel/${item.providerId}/${item.novelId}`">
          {{ item.titleJp }}
        </c-a>

        <n-text v-if="item.titleZh">
          {{ item.titleZh }}
        </n-text>

        <n-a
          v-if="!simple"
          :href="WebUtil.buildNovelUrl(item.providerId, item.novelId)"
        >
          {{ item.providerId + '.' + item.novelId }}
        </n-a>

        <n-text v-if="item.extra" depth="3">
          {{ item.extra }}
        </n-text>

        <n-text v-if="!simple" depth="3">
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
        </n-text>

        <n-text v-if="item.total" depth="3">
          {{ item.type ? item.type + ' / ' : '' }}
          总计 {{ item.total }} / 百度 {{ item.baidu }} / 有道
          {{ item.youdao }} / GPT {{ item.gpt }} / Sakura {{ item.sakura }} /
          Murasaki {{ item.murasaki }} /
        </n-text>

        <n-text depth="3">
          <template v-if="item.favored">
            <n-text type="warning" v-if="item.favored">
              <n-icon :size="10" :component="StarFilled" />
            </n-text>
            收藏于：{{ favoredTitleMap.get(item.favored) || '未知收藏夹' }} /
          </template>
          <template v-if="item.updateAt">
            本站更新于
            <n-time :time="item.updateAt * 1000" type="relative" />
            /
          </template>
          <template v-if="item.lastReadAt">
            <n-time :time="item.lastReadAt * 1000" type="relative" />
            看过 /
          </template>
        </n-text>
      </n-flex>

      <slot name="action" v-bind="item" />

      <c-select-overlay
        v-if="selectable"
        :checked="selectedIds.includes(`${item.providerId}/${item.novelId}`)"
        @update:checked="
          (checked: boolean) =>
            toggleNovelSelect(`${item.providerId}/${item.novelId}`, checked)
        "
      />
    </n-list-item>
  </n-list>
</template>
