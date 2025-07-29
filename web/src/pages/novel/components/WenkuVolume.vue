<script lang="ts" setup>
import {
  DeleteFilled,
  DonutLargeFilled,
  FileDownloadOutlined,
  LibraryBooksFilled,
  UpdateFilled,
} from '@vicons/material';
import { useKeyModifier } from '@vueuse/core';

import { Locator } from '@/data';
import { WenkuNovelRepository } from '@/data/api';
import {
  TranslateTaskDescriptor,
  TranslateTaskParams,
} from '@/model/Translator';
import { VolumeJpDto } from '@/model/WenkuNovel';
import TranslateTask from '@/components/TranslateTask.vue';
import { useIsWideScreen } from '@/pages/util';

const { novelId, volume, getParams } = defineProps<{
  novelId: string;
  volume: VolumeJpDto;
  getParams: () => TranslateTaskParams;
}>();

const emit = defineEmits<{
  delete: [];
}>();

const message = useMessage();

const { setting } = Locator.settingRepository();
const { whoami } = Locator.authRepository();

const translateTask = ref<InstanceType<typeof TranslateTask>>();
const startTranslateTask = (translatorId: 'baidu' | 'youdao') => {
  return translateTask?.value?.startTask(
    { type: 'wenku', novelId, volumeId: volume.volumeId },
    getParams(),
    { id: translatorId },
  );
};

const file = computed(() => {
  const { mode, translationsMode, translations } = setting.value.downloadFormat;

  const { url, filename } = WenkuNovelRepository.createFileUrl({
    novelId,
    volumeId: volume.volumeId,
    mode,
    translationsMode,
    translations,
  });
  return { url, filename };
});

const formatFileSize = (bytes: number) => {
  if (bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const threshold = 1024;

  // 处理0字节的特殊情况
  if (bytes === 0) return `0 ${units[0]}`;

  // 计算单位索引
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(threshold));

  // 确保索引不超过单位数组范围
  const index = Math.min(unitIndex, units.length - 1);

  // 计算格式化后的值
  const formattedSize = (bytes / Math.pow(threshold, index)).toFixed(2);

  // 移除多余的小数位（如.00）
  return `${parseFloat(formattedSize)} ${units[index]}`;
};

const shouldTopJob = useKeyModifier('Control');
const submitJob = (id: 'gpt' | 'sakura') => {
  const task = TranslateTaskDescriptor.wenku(
    novelId,
    volume.volumeId,
    getParams(),
  );
  const workspace =
    id === 'gpt'
      ? Locator.gptWorkspaceRepository()
      : Locator.sakuraWorkspaceRepository();
  const job = {
    task,
    description: volume.volumeId,
    createAt: Date.now(),
  };
  const success = workspace.addJob(job);
  if (success) {
    message.success('排队成功');
    if (shouldTopJob.value) {
      workspace.topJob(job);
    }
  } else {
    message.error('排队失败：翻译任务已经存在');
  }
};

const isWideScreen = useIsWideScreen();
const expandedNames = computed(() => {
  return isWideScreen.value ? ['1'] : []; // 宽屏展开，窄屏折叠
});
</script>

<template>
  <n-card content-style="padding: 0;" hoverable>
    <div class="card-header">
      <div class="novel-title">{{ volume.volumeId }}</div>
      <n-flex :x-gap="20" style="margin-top: 15px">
        <n-tag type="success" round>
          <template #icon>
            <n-icon :component="LibraryBooksFilled" />
          </template>
          <span>总计章节数: {{ volume.total }}</span>
        </n-tag>
        <n-tag type="success" round>
          <template #icon>
            <n-icon :component="UpdateFilled" />
          </template>
          最后更新:
          <n-time :time="volume.lastModifiedTime" type="datetime" />
        </n-tag>
        <n-tag type="success" round>
          <template #icon>
            <n-icon :component="DonutLargeFilled" />
          </template>
          <span>文件大小: {{ formatFileSize(volume.fileSize) }}</span>
        </n-tag>
      </n-flex>
    </div>

    <div class="card-body">
      <div class="download-section">
        <n-flex>
          <c-button
            label="下载翻译文件"
            tag="a"
            :icon="FileDownloadOutlined"
            :href="file.url"
            :download="file.filename"
            target="_blank"
            secondary
            class="btn"
          />
          <c-button
            v-if="whoami.asMaintainer"
            :hint="`真的要删除《${volume.volumeId}》吗？`"
            label="删除"
            :icon="DeleteFilled"
            type="error"
            secondary
            @action="emit('delete')"
            class="btn"
          />
        </n-flex>
      </div>
      <n-collapse :default-expanded-names="expandedNames">
        <n-collapse-item title="翻译任务" name="1">
          <n-grid :x-gap="18" :y-gap="18" cols="1 s:2 m:4" responsive="screen">
            <n-grid-item>
              <div class="translator-card">
                <div class="translator-header">
                  <div class="translator-icon baidu-icon"></div>
                  <div class="translator-name">百度翻译</div>
                </div>

                <div class="progress-section">
                  <div class="progress-info">
                    <span class="progress-label">翻译进度:</span>
                    <span class="progress-value">{{ volume.baidu }}</span>
                  </div>
                </div>

                <div class="action-buttons">
                  <c-button
                    v-if="setting.enabledTranslator.includes('baidu')"
                    label="更新进度"
                    secondary
                    @action="startTranslateTask('baidu')"
                    class="btn"
                  />
                </div>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="translator-card">
                <div class="translator-header">
                  <div class="translator-icon youdao-icon">
                    <i class="fas fa-y"></i>
                  </div>
                  <div class="translator-name">有道翻译</div>
                </div>

                <div class="progress-section">
                  <div class="progress-info">
                    <span class="progress-label">翻译进度:</span>
                    <span class="progress-value">{{ volume.youdao }}</span>
                  </div>
                </div>

                <div class="action-buttons">
                  <c-button
                    v-if="setting.enabledTranslator.includes('youdao')"
                    label="更新进度"
                    secondary
                    @action="startTranslateTask('youdao')"
                    class="btn"
                  />
                </div>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="translator-card">
                <div class="translator-header">
                  <div class="translator-icon gpt-icon">
                    <i class="fas fa-robot"></i>
                  </div>
                  <div class="translator-name">GPT翻译</div>
                </div>

                <div class="progress-section">
                  <div class="progress-info">
                    <span class="progress-label">翻译进度:</span>
                    <span class="progress-value">{{ volume.gpt }}</span>
                  </div>
                </div>

                <div class="action-buttons">
                  <c-button
                    v-if="setting.enabledTranslator.includes('gpt')"
                    label="更新进度"
                    secondary
                    @action="submitJob('gpt')"
                    class="btn"
                  />
                </div>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="translator-card">
                <div class="translator-header">
                  <div class="translator-icon sakura-icon">
                    <i class="fas fa-leaf"></i>
                  </div>
                  <div class="translator-name">Sakura翻译</div>
                </div>

                <div class="progress-section">
                  <div class="progress-info">
                    <span class="progress-label">翻译进度:</span>
                    <span class="progress-value">{{ volume.sakura }}</span>
                  </div>
                </div>

                <div class="action-buttons">
                  <c-button
                    v-if="setting.enabledTranslator.includes('sakura')"
                    label="更新进度"
                    secondary
                    @action="submitJob('sakura')"
                    class="btn"
                  />
                </div>
              </div>
            </n-grid-item>
          </n-grid>
          <TranslateTask
            ref="translateTask"
            @update:baidu="(zh) => (volume.baidu = zh)"
            @update:youdao="(zh) => (volume.youdao = zh)"
            @update:gpt="(zh) => (volume.gpt = zh)"
            @update:sakura="(zh) => (volume.sakura = zh)"
            style="margin-top: 20px"
          />
        </n-collapse-item>
      </n-collapse>
    </div>
  </n-card>
</template>

<style scoped>
.card-header {
  padding: 25px 25px 0 25px;
  position: relative;
}

.novel-title {
  font-size: 1.35rem;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;
}

.card-body {
  padding: 25px;
}

.translator-card {
  border: 1px solid #e9ecef;
  border-radius: 10px;
  padding: 18px;
  transition: all 0.3s ease;
}

.translator-card:hover {
  border-color: #18a058;
  box-shadow: 0 5px 15px rgba(52, 152, 219, 0.1);
}

.translator-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  gap: 10px;
}

.translator-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.1rem;
}

.baidu-icon {
  background: linear-gradient(135deg, #4a86e8, #3a66b4);
}

.youdao-icon {
  background: linear-gradient(135deg, #fa4b3e, #c0392b);
}

.gpt-icon {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
}

.sakura-icon {
  background: linear-gradient(135deg, #ffe6f2, #ffcce6, #ff99cc, #d180a0);
}

.translator-name {
  font-weight: 600;
  font-size: 1.05rem;
}

.progress-section {
  margin-top: 15px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.95rem;
}

.progress-value {
  font-weight: 700;
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.btn {
  flex: 1;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

.btn:active {
  transform: translateY(0);
}

.download-section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
  text-align: center;
}
</style>
