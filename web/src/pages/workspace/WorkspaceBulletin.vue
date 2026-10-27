<script lang="ts" setup>
import { allowModels } from '@auto-novel/translator';
import { forumPostUrls, siteUrls } from '@/config';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';

const props = defineProps<{ translatorId: TranslatorId }>();
const isSakura = computed(() => props.translatorId === 'sakura');
</script>

<template>
  <bulletin>
    <template v-if="isSakura">
      <n-flex>
        <n-a
          :href="forumPostUrls.sakuraDeployGuide"
          target="_blank"
          rel="noopener noreferrer"
        >
          本地部署教程
        </n-a>
        /
        <span>
          <n-a
            :href="forumPostUrls.sakuraAutoDlGuide"
            target="_blank"
            rel="noopener noreferrer"
          >
            AutoDL教程
          </n-a>
          :
          <n-a
            href="https://www.autodl.com/console/instance/list"
            target="_blank"
            rel="noopener noreferrer"
          >
            控制台
          </n-a>
        </span>
        /
        <n-a
          :href="siteUrls.sakuraMonitor"
          target="_blank"
          rel="noopener noreferrer"
        >
          共享 Sakura 当前负载
        </n-a>
      </n-flex>
      <n-p>允许上传的模型如下，禁止一切试图突破上传检查的操作。</n-p>
      <n-ul>
        <n-li v-for="({ repo }, model) in allowModels" :key="model">
          [
          <n-a
            :href="`https://huggingface.co/${repo}/blob/main/${model}.gguf`"
            target="_blank"
            rel="noopener noreferrer"
          >
            HF
          </n-a>
          /
          <n-a
            :href="`https://hf-mirror.com/${repo}/blob/main/${model}.gguf`"
            target="_blank"
            rel="noopener noreferrer"
          >
            国内镜像
          </n-a>
          ]
          {{ model }}
        </n-li>
      </n-ul>
    </template>
    <template v-else>
      <n-flex>
        <n-a
          :href="forumPostUrls.usageGuide"
          target="_blank"
          rel="noopener noreferrer"
        >
          使用教程
        </n-a>
        /
        <n-a
          href="https://chat.deepseek.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          DeepSeek Chat
        </n-a>
        /
        <n-a
          href="https://platform.deepseek.com/usage"
          target="_blank"
          rel="noopener noreferrer"
        >
          DeepSeek API
        </n-a>
      </n-flex>
      <n-p>本地小说支持韩语等其他语种，网络小说/文库小说暂时只允许日语。</n-p>
    </template>
  </bulletin>
</template>
