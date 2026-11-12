<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import { vHorizontalDrag } from '@/util/dragScroll';
import { Toast } from '@novelia/web-kit';
import { ImgComparisonSlider } from '@img-comparison-slider/vue';

import { Humanize } from '@/util';
import type { Epub, ParsedFile } from '@/util/file';

import { FileProcessor } from './file';

const props = defineProps<{
  files: ParsedFile[];
}>();

const quality = ref(0.8);
const scaleRatio = ref(1.0);

const imageFormat = ref('image/webp');
const imageFormatOptions = [
  { label: '不改变图片格式', value: '' },
  { label: 'PNG', value: 'image/png' },
  { label: 'JPEG', value: 'image/jpeg' },
  { label: 'WEBP', value: 'image/webp' },
];

const compressImage = async (blob: Blob) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  // eslint-disable-next-line compat/compat
  const img = await createImageBitmap(blob);

  const scaleRatioValue = Math.min(1, scaleRatio.value);
  canvas.width = img.width * scaleRatioValue;
  canvas.height = img.height * scaleRatioValue;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageFormatValue = imageFormat.value;
  const qualityValue = quality.value;

  return await new Promise<Blob | undefined>((resolve, _reject) => {
    canvas.toBlob(
      (newBlob) => {
        resolve(newBlob ?? undefined);
      },
      imageFormatValue,
      qualityValue,
    );
  });
};

const compressImagesForEpub = async (epub: Epub) => {
  for await (const item of epub.iterImage()) {
    const newBlob = await compressImage(item.blob);
    if (!newBlob)
      throw new Error(`压缩失败\n文件:${epub.name}\n图片:${item.href}`);
    epub.updateImage(item.id, newBlob);
  }
};

const compressImages = () =>
  FileProcessor.modifyFiles(
    props.files.filter((file) => file.type === 'epub'),
    compressImagesForEpub,
    (e) => Toast.error(`发生错误：${e}`),
  );

interface EpubImage {
  id: string;
  href: string;
  blob: Blob;
  uri: string;
  blobCompressed: Blob | undefined;
  uriCompressed: string;
}
interface EpubDetail {
  name: string;
  images: EpubImage[];
  size: number;
  sizeCompressed: number;
  failed: number;
}

const getEpubDetailList = async () => {
  const detailList: EpubDetail[] = [];
  for (const file of props.files) {
    if (file.type === 'epub') {
      const detail: EpubDetail = {
        name: file.name,
        images: [],
        size: 0,
        sizeCompressed: 0,
        failed: 0,
      };
      for await (const item of file.iterImage()) {
        const blobCompressed = await compressImage(item.blob);
        detail.images.push({
          id: item.id,
          href: item.href,
          blob: item.blob,
          uri: URL.createObjectURL(item.blob),
          blobCompressed,
          uriCompressed: URL.createObjectURL(blobCompressed ?? item.blob),
        });
        detail.size += item.blob.size;
        detail.sizeCompressed += (blobCompressed ?? item.blob).size;
        if (!blobCompressed) detail.failed += 1;
      }
      detailList.push(detail);
    }
  }
  return detailList;
};

const showDetail = ref(false);
const detailList = ref<EpubDetail[]>([]);
const toggleShowDetail = async () => {
  if (showDetail.value) {
    showDetail.value = false;
    detailList.value = [];
  } else {
    showDetail.value = true;
    detailList.value = await getEpubDetailList();
  }
};

const showCompare = ref(false);
const compareImages = ref({ old: '', new: '' });
const showPreview = (image: EpubImage) => {
  showCompare.value = true;
  compareImages.value.old = image.uri;
  compareImages.value.new = image.uriCompressed;
};
</script>

<template>
  <div class="flex flex-col gap-y-2">
    <c-action-wrapper title="格式">
      <c-radio-group
        v-model:value="imageFormat"
        :options="imageFormatOptions"
        size="small"
      />
    </c-action-wrapper>

    <c-action-wrapper title="压缩率" align="center">
      <USlider
        class="max-w-[400px]"
        :tooltip="{ text: `${(quality * 100).toFixed(0)}%` }"
        aria-label="压缩率"
        v-model="quality"
        :max="1"
        :min="0.1"
        :step="0.05"
      />
      <span class="text-ink w-[6em]">{{ (quality * 100).toFixed(0) }}%</span>
    </c-action-wrapper>

    <c-action-wrapper title="尺寸" align="center">
      <USlider
        class="max-w-[400px]"
        :tooltip="{ text: `${(scaleRatio * 100).toFixed(0)}%` }"
        aria-label="尺寸"
        v-model="scaleRatio"
        :max="1"
        :min="0.1"
        :step="0.05"
      />
      <span class="text-ink w-[6em]">{{ (scaleRatio * 100).toFixed(0) }}%</span>
    </c-action-wrapper>

    <UFieldGroup>
      <ActionButton :action="compressImages">压缩</ActionButton>
      <ActionButton :action="toggleShowDetail">预览效果</ActionButton>
    </UFieldGroup>

    <template v-if="showDetail">
      <span class="text-ink">点击图片预览压缩效果</span>
      <CEmpty inline v-if="detailList.length === 0" title="未载入文件" />
      <template v-for="detail of detailList" :key="detail.name">
        <span class="text-ink">
          [{{ Humanize.bytes(detail.size) }}
          =>
          {{ Humanize.bytes(detail.sizeCompressed) }}]
          {{ detail.name }}
        </span>
        <UScrollArea orientation="horizontal" v-horizontal-drag class="mt-4">
          <n-image-group show-toolbar-tooltip>
            <div class="mb-4 flex gap-1">
              <n-image
                class="rounded-[2px]!"
                v-for="image of detail.images"
                :key="image.id"
                height="150"
                :src="image.uri"
                preview-disabled
                :alt="image.id"
                @click="showPreview(image)"
              />
            </div>
          </n-image-group>
        </UScrollArea>
      </template>
    </template>

    <UModal
      v-model:open="showCompare"
      title="图片压缩对比"
      :ui="{ content: 'w-auto max-w-[95vw]', title: 'sr-only' }"
    >
      <template #body>
        <img-comparison-slider class="outline-none">
          <!-- eslint-disable -->
          <img
            class="w-full max-h-[85vh]"
            slot="first"
            :src="compareImages.old"
          />
          <img
            class="w-full max-h-[85vh]"
            slot="second"
            :src="compareImages.new"
          />
          <!-- eslint-enable -->
        </img-comparison-slider>
      </template>
    </UModal>
  </div>
</template>
