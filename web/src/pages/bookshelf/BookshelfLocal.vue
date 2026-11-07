<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

defineProps<{
  favoredId: string;
}>();

const showControlPanel = ref(false);

const bookshelfListRef = useTemplateRef('bookshelfList');
</script>

<template>
  <n-flex style="margin-bottom: 24px">
    <c-button
      label="选择"
      :icon="ChecklistOutlined"
      @action="showControlPanel = !showControlPanel"
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
</template>
