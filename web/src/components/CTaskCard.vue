<script lang="ts" setup>
const props = defineProps<{
  title: string;
  running: boolean;
}>();

const show = ref(false);
watch(
  () => props.running,
  (running) => {
    if (running) {
      show.value = true;
    }
  },
);

type LogLine = { message: string; detail?: string[] };
const logs = ref<LogLine[]>([]);

const clearLog = () => {
  logs.value = [];
};
const pushLog = (line: LogLine) => {
  logs.value.push(line);
};

const logRef = ref<{ $el: HTMLElement }>();
const enableAutoScroll = ref(true);
const expandLog = ref(false);

watch(
  logs,
  () => {
    if (enableAutoScroll.value) {
      nextTick(() => {
        logRef.value?.$el.scrollBy({ top: 100 });
      });
    }
  },
  { deep: true },
);

const showLogDetailModal = ref(false);
const selectedLogDetail = ref([] as string[]);
const selectedLogMessage = ref('');
const showDetail = (message: string, detail: string[]) => {
  selectedLogMessage.value = message.trim();
  selectedLogDetail.value = detail;
  showLogDetailModal.value = true;
};

defineExpose({
  clearLog,
  pushLog,
  hide: () => {
    show.value = false;
  },
});
</script>

<template>
  <UCard
    v-show="show"
    variant="soft"
    class="divide-y-0 bg-embedded text-sm leading-[1.6] text-default"
    :ui="{
      header: 'px-6 pt-5 pb-0 sm:px-6',
      body: 'px-6 py-5 sm:px-6 sm:py-5',
    }"
  >
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="min-w-0 flex-1 text-lg font-medium break-words">
          {{ title }} [{{ running ? '运行中' : '已结束' }}]
        </h3>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            class="rounded-full text-sm/4"
            @click="enableAutoScroll = !enableAutoScroll"
          >
            {{ enableAutoScroll ? '暂停滚动' : '自动滚动' }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            class="rounded-full text-sm/4"
            @click="expandLog = !expandLog"
          >
            {{ expandLog ? '收起日志' : '展开日志' }}
          </UButton>
        </div>
      </div>
    </template>
    <div class="flex gap-x-3">
      <UScrollArea
        ref="logRef"
        class="min-w-0 flex-auto whitespace-pre-wrap"
        :class="expandLog ? 'h-[540px]' : 'h-[180px]'"
      >
        <div v-for="log of logs" :key="log.message">
          {{ log.message }}
          <span v-if="log.detail" @click="showDetail(log.message, log.detail!)">
            [详细]
          </span>
        </div>
      </UScrollArea>
      <slot />
    </div>

    <UModal
      :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
      v-model:open="showLogDetailModal"
      :title="`日志详情 - ${selectedLogMessage}`"
      class="w-150"
    >
      <template #body>
        <p
          class="my-4 whitespace-pre-wrap text-sm leading-[1.6] text-default first:mt-0 last:mb-0"
          v-for="line of selectedLogDetail"
          :key="line"
        >
          {{ line }}
        </p>
      </template>
    </UModal>
  </UCard>
</template>
