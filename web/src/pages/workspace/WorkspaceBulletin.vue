<script lang="ts" setup>
import { allowModels } from '@auto-novel/translator';
import { forumPostUrls, siteUrls } from '@/config';
import type { WorkspaceTranslatorId } from '@/model/Translator';

const props = defineProps<{ translatorId: WorkspaceTranslatorId }>();
const isSakura = computed(() => props.translatorId === 'sakura');
</script>

<template>
  <bulletin>
    <template v-if="isSakura">
      <div class="flex flex-wrap gap-x-3 gap-y-2">
        <ULink :href="forumPostUrls.sakuraDeployGuide" target="_blank">
          本地部署教程
        </ULink>
        /
        <span>
          <ULink :href="forumPostUrls.sakuraAutoDlGuide" target="_blank">
            AutoDL教程
          </ULink>
          :
          <ULink
            href="https://www.autodl.com/console/instance/list"
            target="_blank"
          >
            控制台
          </ULink>
        </span>
        /
        <ULink :href="siteUrls.sakuraMonitor" target="_blank">
          共享 Sakura 当前负载
        </ULink>
      </div>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        允许上传的模型如下，禁止一切试图突破上传检查的操作。
      </p>
      <ul class="content-list">
        <li v-for="({ repo }, model) in allowModels" :key="model">
          [
          <ULink
            :href="`https://huggingface.co/${repo}/blob/main/${model}.gguf`"
            target="_blank"
          >
            HF
          </ULink>
          /
          <ULink
            :href="`https://hf-mirror.com/${repo}/blob/main/${model}.gguf`"
            target="_blank"
          >
            国内镜像
          </ULink>
          ]
          {{ model }}
        </li>
      </ul>
    </template>
    <template v-else>
      <div class="flex flex-wrap gap-x-3 gap-y-2">
        <ULink :href="forumPostUrls.usageGuide" target="_blank">使用教程</ULink>
        /
        <ULink href="https://chat.deepseek.com" target="_blank">
          DeepSeek Chat
        </ULink>
        /
        <ULink href="https://platform.deepseek.com/usage" target="_blank">
          DeepSeek API
        </ULink>
      </div>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        本地小说支持韩语等其他语种，网络小说/文库小说暂时只允许日语。
      </p>
    </template>
  </bulletin>
</template>
