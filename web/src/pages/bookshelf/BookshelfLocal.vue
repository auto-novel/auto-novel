<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

defineProps<{
  favoredId: string;
}>();

const showControlPanel = ref(false);

const bookshelfListRef = useTemplateRef('bookshelfList');
</script>

<template>
  <div class="mb-6 flex flex-wrap justify-start gap-x-3 gap-y-2">
    <UButton
      color="neutral"
      variant="outline"
      class="rounded-full"
      @click="showControlPanel = !showControlPanel"
    >
      <component
        :is="ChecklistOutlined"
        class="size-4.5 shrink-0"
        aria-hidden="true"
      />
      选择
    </UButton>
    <div>
      <bookshelf-local-add-button :favored-id="favoredId" />
    </div>
  </div>

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
