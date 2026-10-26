<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import type { ParsedFile, Txt } from '@/util/file';
import { RegexUtil } from '@/util';

import { FileProcessor } from './file';

const props = defineProps<{
  files: ParsedFile[];
}>();

const fixOcrForTxt = async (txt: Txt) => {
  const endsCorrectly = (s: string) => {
    if (s.length === 0) {
      return true;
    }
    const lastChar = s.charAt(s.length - 1);
    if (
      lastChar === '，' ||
      lastChar === ',' ||
      RegexUtil.hasHanzi(lastChar) ||
      RegexUtil.hasKanaChars(lastChar) ||
      RegexUtil.hasHangulChars(lastChar) ||
      RegexUtil.hasEnglishChars(lastChar)
    ) {
      return false;
    } else {
      return true;
    }
  };

  const lines: string[] = [];
  let lineProcessing = '';
  for (let line of txt.text.split('\n')) {
    if (lineProcessing.length > 0) {
      line = lineProcessing + line.trim();
      lineProcessing = '';
    } else {
      line = line.trimEnd();
    }
    if (endsCorrectly(line)) {
      lines.push(line);
    } else {
      lineProcessing = line;
    }
  }
  if (lineProcessing.length > 0) {
    lines.push(lineProcessing);
  }
  txt.text = lines.join('\n');
};

const fixOcr = () =>
  FileProcessor.modifyFiles(
    props.files.filter((file) => file.type === 'txt'),
    fixOcrForTxt,
    (e) => Toast.error(`发生错误：${e}`),
  );
</script>

<template>
  <n-flex vertical>
    OCR输出的文本通常存在额外的换行符，导致翻译器错误。当前修复方法是检测每一行的结尾是否是字符（汉字/日文假名/韩文字符/英文字母/全角半角逗号），如果是的话则删除行尾的换行符。
    <n-flex>
      <c-button label="修复" @action="fixOcr" />
    </n-flex>
  </n-flex>
</template>
