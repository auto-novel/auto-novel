import {
  useBreakpoints as useBreakpointsInner,
  useWindowSize,
} from '@vueuse/core';
import type { MessageApi } from 'naive-ui';

import { formatError } from '@/api';

export const useIsWideScreen = (limit: number = 840) => {
  const { width } = useWindowSize();
  return computed(() => width.value > limit);
};

export const useBreakPoints = () =>
  useBreakpointsInner({
    mobile: 0,
    tablet: 540,
    desktop: 1200,
  });

export const doAction = (
  promise: Promise<unknown>,
  label: string,
  message: MessageApi,
) =>
  promise
    .then(() => {
      message.info(label + '成功');
    })
    .catch(async (e) => {
      message.error(label + '失败:' + (await formatError(e)));
    });

type KeyPredicate = (event: KeyboardEvent) => boolean;
type KeyFilter = string | string[] | KeyPredicate;

const createKeyPredicate = (keyFilter: KeyFilter): KeyPredicate => {
  if (typeof keyFilter === 'function') {
    return keyFilter;
  } else if (typeof keyFilter === 'string') {
    return (e: KeyboardEvent) => !e.isComposing && e.key === keyFilter;
  } else if (Array.isArray(keyFilter)) {
    return (e: KeyboardEvent) => !e.isComposing && keyFilter.includes(e.key);
  }
  return () => true;
};

export const onKeyDown = (
  key: KeyFilter,
  handler: (event: KeyboardEvent) => void,
) => {
  const listener = (e: KeyboardEvent) => {
    const predicate = createKeyPredicate(key);
    if (predicate(e)) handler(e);
  };
  onActivated(() => document.addEventListener('keydown', listener));
  onDeactivated(() => document.removeEventListener('keydown', listener));
};

export const copyToClipBoard = async (
  text: string,
  parentNode?: HTMLElement | null,
) => {
  // 优先使用 navigator 提供的复制方法
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  // 回退到传统复制方法
  // 创建临时可编辑元素，使用div元素避免弹出输入法
  const textEl = document.createElement('div');
  textEl.innerText = text;
  Object.assign(textEl.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    opacity: '0',
  });
  textEl.contentEditable = 'true';

  // modal 内的复制，需要一个 modal 内部的元素作为 parentNode 来储存临时文本
  const targetNode = parentNode ?? document.body;
  targetNode.appendChild(textEl);

  try {
    const range = document.createRange();
    range.selectNodeContents(textEl);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    return document.execCommand('copy');
  } finally {
    targetNode.removeChild(textEl);
  }
};
