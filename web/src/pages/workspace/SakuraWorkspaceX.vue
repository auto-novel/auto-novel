<script lang="ts" setup>
import {
  BookOutlined,
  DeleteOutlineOutlined,
  PlusOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';

import { SakuraTranslator } from '@/domain/translate';
import { TranslationCacheRepo } from '@/repos';
import { doAction } from '@/pages/util';
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';
import { useSakuraWorkspaceStore, useSettingStore } from '@/stores';

import { useWorkspaceXStore } from './WorkspaceStore';

const message = useMessage();

const workspace = useSakuraWorkspaceStore();
const workspaceRef = workspace.ref;

const store = useWorkspaceXStore('sakura');
const settingStore = useSettingStore();

// Play sound when all jobs finish
let hadJobs = false;
watch(
  () => store.jobs.length,
  (len) => {
    if (len > 0) hadJobs = true;
    if (len === 0 && hadJobs && settingStore.setting.workspaceSound) {
      hadJobs = false;
      new Audio(SoundAllTaskCompleted).play();
    }
  },
);

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
  doAction(TranslationCacheRepo.clear('sakura-seg-cache'), '缓存清除', message);
</script>

<template>
  <div class="layout-content">
    <n-h1>Sakura工作区</n-h1>

    <bulletin>
      <n-flex>
        <c-a to="/forum/656d60530286f15e3384fcf8" target="_blank">
          本地部署教程
        </c-a>
        /
        <span>
          <c-a to="/forum/65719bf16843e12bd3a4dc98" target="_blank">
            AutoDL教程
          </c-a>
          :
          <n-a
            href="https://www.autodl.com/console/instance/list"
            target="_blank"
          >
            控制台
          </n-a>
        </span>
        /
        <n-a
          href="https://monitor.novelia.cc/public-dashboards/be71c46fcc0e40eeaf06d9e7a2e26f95?refresh=auto&from=now-5m&to=now&timezone=browser"
          target="_blank"
        >
          共享 Sakura 当前负载
        </n-a>
      </n-flex>

      <n-p>允许上传的模型如下，禁止一切试图突破上传检查的操作。</n-p>
      <n-ul>
        <n-li
          v-for="({ repo }, model) in SakuraTranslator.allowModels"
          :key="model"
        >
          [
          <n-a
            target="_blank"
            :href="`https://huggingface.co/${repo}/blob/main/${model}.gguf`"
          >
            HF
          </n-a>
          /
          <n-a
            target="_blank"
            :href="`https://hf-mirror.com/${repo}/blob/main/${model}.gguf`"
          >
            国内镜像
          </n-a>
          ]
          {{ model }}
        </n-li>
      </n-ul>
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
            :worker="{ translatorId: 'sakura', ...worker }"
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

    <job-record-section id="sakura" />
  </div>

  <local-volume-list-specific-translation
    v-model:show="showLocalVolumeDrawer"
    type="sakura"
  />

  <sakura-worker-modal v-model:show="showCreateWorkerModal" />
</template>
