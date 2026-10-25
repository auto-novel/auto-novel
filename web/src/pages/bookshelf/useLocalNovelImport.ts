import { Toast } from '@novelia/web-kit';
import { ref } from 'vue';

import { useBookshelfLocalStore } from './BookshelfLocalStore';

const phaseLabels = {
  parsing: '正在解析文件',
  saving: '正在保存到本地',
};

const validateFile = (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['txt', 'epub', 'srt'].includes(ext)) {
    return '仅支持 Epub/Txt/Srt 文件';
  }
  if (file.size > 1024 * 1024 * 100) return '文件大小不能超过 100MB';
};

export const useLocalNovelImport = (onDone: (file: File) => void) => {
  const store = useBookshelfLocalStore();
  const running = ref(false);

  const importFiles = async (files: File[], favoredId: string) => {
    if (files.length === 0) return;
    if (running.value) {
      Toast.info('正在导入，请稍候');
      return;
    }
    running.value = true;
    // 常驻 toast 逐本更新，结束后改成会自动关闭的结果提示。
    const toastId = Toast.info(`正在导入 ${files.length} 个文件`, {
      duration: 0,
    });
    let success = 0;
    try {
      // 逐本处理：单本解析时整本内容都驻留内存，并发会把峰值成倍放大。
      for (const [index, file] of files.entries()) {
        const error = validateFile(file);
        if (error) {
          Toast.error(`导入失败:${error}\n文件名: ${file.name}`);
          continue;
        }
        const prefix = `${index + 1}/${files.length} ${file.name}`;
        try {
          await store.addVolume(file, favoredId, (phase) =>
            Toast.update(toastId, {
              message: `${prefix}：${phaseLabels[phase]}`,
            }),
          );
          success += 1;
          onDone(file);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          Toast.error(`导入失败:${message}\n文件名: ${file.name}`);
        }
      }
    } finally {
      running.value = false;
      const failed = files.length - success;
      Toast.update(toastId, {
        status: failed === 0 ? 'success' : 'warning',
        message: `导入完成：成功 ${success} 本，失败 ${failed} 本`,
        duration: 4000,
      });
    }
  };

  return { running, importFiles };
};
