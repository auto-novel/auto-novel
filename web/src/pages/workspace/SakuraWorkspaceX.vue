<script lang="ts" setup>
import { DeleteOutlineOutlined, PlusOutlined } from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';

import { Locator } from '@/data';
import { SakuraTranslator } from '@/domain/translate';
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';

import { doAction, useIsWideScreen } from '@/pages/util';
import { useWorkspaceStore } from './WorkspaceStore';

const message = useMessage();
const isWideScreen = useIsWideScreen();

const { setting } = Locator.settingRepository();

const showCreateWorkerModal = ref(false);

const store = useWorkspaceStore('sakura');

const { jobs, workspace } = storeToRefs(store);

const clearCache = async () =>
  doAction(store.cleanCache(), '缓存清除', message);
</script>

<template>
  <c-layout
    :sidebar="isWideScreen && !setting.hideLocalVolumeListInWorkspace"
    :sidebar-width="320"
    class="layout-content"
  >
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
      </n-flex>

      <n-p> 允许上传的模型如下，禁止一切试图突破上传检查的操作。 </n-p>
      <n-ul>
        <n-li v-for="({ repo }, model) in SakuraTranslator.allowModels">
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

      <n-popconfirm
        :show-icon="false"
        @positive-click="clearCache"
        :negative-text="null"
        style="max-width: 300px"
      >
        <template #trigger>
          <c-button label="清空缓存" :icon="DeleteOutlineOutlined" />
        </template>
        真的要清空缓存吗？
      </n-popconfirm>
    </section-header>

    <n-empty v-if="workspace.workers.length === 0" description="没有翻译器" />
    <n-list>
      <vue-draggable
        v-model="workspace.workers"
        :animation="150"
        handle=".drag-trigger"
      >
        <n-list-item v-for="worker of workspace.workers">
          <job-worker-x
            :worker="{ translatorId: 'sakura', ...worker }"
            :request-seg="() => undefined"
            :post-seg="(it) => {}"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <section-header title="任务队列">
      <n-popconfirm
        :show-icon="false"
        @positive-click="store.deleteAllJobs"
        :negative-text="null"
        style="max-width: 300px"
      >
        <template #trigger>
          <c-button label="清空队列" :icon="DeleteOutlineOutlined" />
        </template>
        真的要清空队列吗？
      </n-popconfirm>
    </section-header>
    <n-empty v-if="workspace.jobs.length === 0" description="没有任务" />
    <n-list>
      <vue-draggable
        v-model="workspace.jobs"
        :animation="150"
        handle=".drag-trigger"
      >
        <n-list-item v-for="job of workspace.jobs" :key="job.task">
          <job-queue-x
            :job="jobs.get(job.task)!!"
            @move-to-top="store.moveToTop(job.task)"
            @move-to-bottom="store.moveToBottom(job.task)"
            @delete="store.deleteJob(job.task)"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <template #sidebar>
      <local-volume-list-specific-translation type="sakura" />
    </template>
  </c-layout>

  <sakura-worker-modal v-model:show="showCreateWorkerModal" />
</template>
