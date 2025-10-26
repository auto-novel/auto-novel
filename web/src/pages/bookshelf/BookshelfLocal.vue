<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

import { useIsWideScreen } from '@/pages/util';

defineProps<{
  favoredId: string;
}>();

const isWideScreen = useIsWideScreen();

const showControlPanel = ref(false);

const bookshelfListRef = useTemplateRef('bookshelfList');
</script>

<template>
  <bookshelf-layout :menu-key="`local/${favoredId}`">
    <n-flex style="margin-bottom: 24px">
      <c-button
        label="选择"
        :icon="ChecklistOutlined"
        @action="showControlPanel = !showControlPanel"
      />
      <bookshelf-list-button
        v-if="!isWideScreen"
        :menu-key="`local/${favoredId}`"
      />
      <div>
        <bookshelf-local-add-button :favored-id="favoredId" />
      </div>
    </n-flex>

    <n-collapse-transition :show="showControlPanel" style="margin-bottom: 16px">
      <bookshelf-local-control
        :selected-ids="bookshelfListRef?.selectedIds ?? []"
        :favored-id="favoredId"
        @select-all="bookshelfListRef?.selectAll()"
        @invert-selection="bookshelfListRef?.invertSelection()"
      />
    </n-collapse-transition>

    <bookshelf-local-list
      ref="bookshelfList"
      :favored-id="favoredId"
      :selectable="showControlPanel"
    />
  </bookshelf-layout>
</template>
