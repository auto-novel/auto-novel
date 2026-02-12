<script lang="ts" setup>
import {
  BookOutlined,
  DeleteOutlineOutlined,
  PlusOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';

import { TranslationCacheRepo } from '@/repos';
import { doAction } from '@/pages/util';
import { useGptWorkspaceStore } from '@/stores';

import { useWorkspaceXStore } from './WorkspaceStore';

const message = useMessage();

const workspace = useGptWorkspaceStore();
const workspaceRef = workspace.ref;

const store = useWorkspaceXStore('gpt');

const showCreateWorkerModal = ref(false);
const showLocalVolumeDrawer = ref(false);

// Sync jobs from legacy workspace store to new store.
watch(
  () => workspaceRef.value.jobs.length,
  () => {
    for (const job of workspaceRef.value.jobs) {
      store.addJob(job.task, job.description);
    }
  },
  { immediate: true },
);

const deleteJob = (descriptor: string) => {
  store.deleteJob(descriptor);
  workspace.deleteJob(descriptor);
};

const deleteAllJobs = () => {
  for (const job of [...store.jobs]) {
    store.deleteJob(job.descriptor);
  }
  for (const job of [...workspaceRef.value.jobs]) {
    workspace.deleteJob(job.task);
  }
};

const clearCache = async () =>
  doAction(TranslationCacheRepo.clear('gpt-seg-cache'), '缓存清除', message);
</script>

<template>
  <div class="layout-content">
    <n-h1>GPT工作区</n-h1>

    <bulletin>
      <n-flex>
        <c-a to="/forum/64f3d63f794cbb1321145c07" target="_blank">使用教程</c-a>
        /
        <n-a href="https://chat.deepseek.com" target="_blank">
          DeepSeek Chat
        </n-a>
        /
        <n-a href="https://platform.deepseek.com/usage" target="_blank">
          DeepSeek API
        </n-a>
      </n-flex>
      <n-p>不再支持GPT web，推荐使用deepseek API，价格很低。</n-p>
      <n-p>本地小说支持韩语等其他语种，网络小说/文库小说暂时只允许日语。</n-p>
    </bulletin>

    <section-header title="翻译器">
      <c-button
        label="添加翻译器"
        :icon="PlusOutlined"
        @action="showCreateWorkerModal = true"
      />
      <c-button-confirm
        hint="真的要清空缓存吗？"
        label="清空缓存"
        :icon="DeleteOutlineOutlined"
        @action="clearCache"
      />
    </section-header>

    <n-empty
      v-if="workspaceRef.workers.length === 0"
      description="没有翻译器"
    />
    <n-list>
      <vue-draggable
        v-model="workspaceRef.workers"
        :animation="150"
        handle=".drag-trigger"
      >
        <n-list-item v-for="worker of workspaceRef.workers" :key="worker.id">
          <job-worker-x
            :worker="{ translatorId: 'gpt', ...worker }"
            :jobs="store.jobs"
            :request-seg="store.requestSeg"
            :release-worker-claims="store.releaseWorkerClaims"
            :post-seg="store.postSeg"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <section-header title="任务队列">
      <c-button
        label="本地书架"
        :icon="BookOutlined"
        @action="showLocalVolumeDrawer = true"
      />
      <c-button-confirm
        hint="真的要清空队列吗？"
        label="清空队列"
        :icon="DeleteOutlineOutlined"
        @action="deleteAllJobs"
      />
    </section-header>

    <n-empty v-if="store.jobs.length === 0" description="没有任务" />
    <n-list>
      <vue-draggable
        v-model="store.jobs"
        :animation="150"
        handle=".drag-trigger"
      >
        <n-list-item v-for="job of store.jobs" :key="job.descriptor">
          <job-queue-x
            :job="job"
            :stats="store.getJobStats(job)"
            @top-job="store.topJob(job.descriptor)"
            @bottom-job="store.bottomJob(job.descriptor)"
            @delete-job="deleteJob(job.descriptor)"
            @retry-task="(ti) => store.retryFailedSegments(job.descriptor, ti)"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <job-record-section id="gpt" />
  </div>

  <local-volume-list-specific-translation
    v-model:show="showLocalVolumeDrawer"
    type="gpt"
  />

  <gpt-worker-modal v-model:show="showCreateWorkerModal" />
</template>
