<script lang="ts" setup>
import {
  BookOutlined,
  DeleteOutlineOutlined,
  PlusOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';

import { MurasakiTranslator } from '@/domain/translate';
import { TranslationCacheRepo } from '@/repos';
import type { TranslateJob } from '@/model/Translator';
import { doAction } from '@/pages/util';
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';
import { useMurasakiWorkspaceStore, useSettingStore } from '@/stores';

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const workspace = useMurasakiWorkspaceStore();
const workspaceRef = workspace.ref;

const showCreateWorkerModal = ref(false);
const showLocalVolumeDrawer = ref(false);

type ProcessedJob = TranslateJob & {
  progress?: { finished: number; error: number; total: number };
};

const processedJobs = ref<Map<string, ProcessedJob>>(new Map());

const getNextJob = () => {
  const job = workspaceRef.value.jobs.find(
    (it) => !processedJobs.value.has(it.task),
  );
  if (job !== undefined) {
    processedJobs.value.set(job.task, job);
  } else if (processedJobs.value.size === 0 && setting.value.workspaceSound) {
    new Audio(SoundAllTaskCompleted).play();
  }
  return job;
};

const deleteJob = (task: string) => {
  if (processedJobs.value.has(task)) {
    message.error('任务被翻译器占用');
    return;
  }
  workspace.deleteJob(task);
};
const deleteAllJobs = () => {
  workspaceRef.value.jobs.forEach((job) => {
    if (processedJobs.value.has(job.task)) {
      return;
    }
    workspace.deleteJob(job.task);
  });
};

const onProgressUpdated = (
  task: string,
  state:
    | { state: 'finish'; abort: boolean }
    | { state: 'processed'; finished: number; error: number; total: number },
) => {
  if (state.state === 'finish') {
    const job = processedJobs.value.get(task)!;
    processedJobs.value.delete(task);
    if (!state.abort) {
      job.finishAt = Date.now();
      workspace.addJobRecord(job as TranslateJob);
      workspace.deleteJob(task);
    }
  } else {
    const job = processedJobs.value.get(task)!;
    job.progress = {
      finished: state.finished,
      error: state.error,
      total: state.total,
    };
  }
};

const clearCache = async () =>
  doAction(
    TranslationCacheRepo.clear('murasaki-seg-cache'),
    '缓存清除',
    message,
  );
</script>

<template>
  <div class="layout-content">
    <n-h1>Murasaki工作区</n-h1>

    <bulletin>
      <n-p>
        Murasaki是一款基于Sakura-qwen3-base微调的带有思维链的翻译模型，拥有更好的上下文理解能力。目前正在测试中。
      </n-p>
      <n-p>允许上传的模型如下，禁止一切试图突破上传检查的操作。</n-p>
      <n-ul>
        <n-li
          v-for="({ repo, file }, model) in MurasakiTranslator.allowModels"
          :key="model"
        >
          <template v-if="repo !== 'local'">
            [
            <n-a
              target="_blank"
              :href="`https://huggingface.co/${repo}/blob/main/${file}`"
            >
              HF
            </n-a>
            /
            <n-a
              target="_blank"
              :href="`https://hf-mirror.com/${repo}/blob/main/${file}`"
            >
              国内镜像
            </n-a>
            ]
          </template>
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
          <job-worker
            :worker="{ translatorId: 'murasaki', ...worker }"
            :get-next-job="getNextJob"
            @update:progress="onProgressUpdated"
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
    <n-empty v-if="workspaceRef.jobs.length === 0" description="没有任务" />
    <n-list>
      <vue-draggable
        v-model="workspaceRef.jobs"
        :animation="150"
        handle=".drag-trigger"
      >
        <n-list-item v-for="job of workspaceRef.jobs" :key="job.task">
          <job-queue
            :job="job"
            :progress="processedJobs.get(job.task)?.progress"
            @top-job="workspace.topJob(job)"
            @bottom-job="workspace.bottomJob(job)"
            @delete-job="deleteJob(job.task)"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <job-record-section id="murasaki" />
  </div>

  <local-volume-list-specific-translation
    v-model:show="showLocalVolumeDrawer"
    type="murasaki"
  />

  <murasaki-worker-modal v-model:show="showCreateWorkerModal" />
</template>
