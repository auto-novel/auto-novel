<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

defineProps<{
  favoredId: string;
}>();

const showControlPanel = ref(false);

const bookshelfListRef = useTemplateRef('bookshelfList');
</script>

<template>
  <div class="mb-6 flex flex-wrap gap-x-3 gap-y-2">
    <UButton
      :icon="ChecklistOutlined"
      color="neutral"
      variant="outline"
      class="rounded-full"
      @click="showControlPanel = !showControlPanel"
    >
      选择
    </UButton>
    <div>
      <bookshelf-local-add-button :favored-id="favoredId" />
    </div>
  </div>

  <UCollapsible v-model:open="showControlPanel">
    <template #content>
      <div class="pb-4">
        <bookshelf-local-control
          :selected-ids="bookshelfListRef?.selectedIds ?? []"
          :favored-id="favoredId"
          @select-all="bookshelfListRef?.selectAll()"
          @invert-selection="bookshelfListRef?.invertSelection()"
        />
      </div>
    </template>
  </UCollapsible>

  <bookshelf-local-list
    ref="bookshelfList"
    :favored-id="favoredId"
    :selectable="showControlPanel"
  />
</template>
