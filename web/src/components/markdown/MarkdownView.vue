<script lang="ts" setup>
import MarkdownItAnchor from 'markdown-it-anchor';
import MarkdownIt from 'markdown-it';
import { spoiler } from '@mdit/plugin-spoiler';
import { container } from '@mdit/plugin-container';
import { NRate } from 'naive-ui';
import { render } from 'vue';

import { PROVIDER_IDS, ProviderId } from '@auto-novel/crawler';

const props = defineProps<{
  mode: 'article' | 'comment';
  source: string;
}>();

const getRules = (mode: 'article' | 'comment') => {
  if (mode === 'article') {
    return [];
  } else if (mode === 'comment') {
    return [
      'backticks',
      'blockquote',
      'code',
      'entity',
      'escape',
      'fence',
      'heading',
      'hr',
      'image',
      'lheading',
      'reference',
      'table',
    ];
  } else {
    return mode satisfies never;
  }
};

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})
  .use(MarkdownItAnchor)
  // spoiler会在点击时切换高亮（未点击时是hover高亮）
  .use(spoiler, {
    tag: 'span',
    attrs: [
      ['data-hide', 'true'],
      [
        'onclick',
        "this.dataset.hide = this.dataset.hide === 'true' ? 'false' : 'true'",
      ],
      ['tabindex', '-1'],
    ],
  })
  .use(container, {
    name: 'details',
    validate: (params) => params.trim().split(' ', 2)[0] === 'details',
    openRender: (tokens, index, _options) => {
      const info = tokens[index].info.trim().slice(8).trim();
      return `<p><details dir="auto"><summary>${info}</summary>`;
    },
    closeRender: (tokens, idx) => {
      return '</details></p>';
    },
  })
  .use(container, {
    name: 'star',
    validate: (params) => params.trim().split(' ', 2)[0] === 'star',
    openRender: (tokens, index, _options) => {
      const info = tokens[index].info.trim().slice(5).trim();
      const starValue = !isNaN(Number(info)) && info !== '' ? info : '0';
      return `<p><div class="starRating" data-star=${starValue}></div></p>`;
    },
  })
  .disable(getRules(props.mode));

// 将 class=starRating 渲染为rating 组件
onMounted(() => {
  const starElements = document.querySelectorAll('.starRating');
  starElements.forEach((starEl) => {
    const starValue = starEl.getAttribute('data-star') || '0';
    const vnode = h(NRate, {
      value: Number(starValue),
      readonly: true,
      allowHalf: true,
      color: '#4fb233',
    });

    const mountPoint = document.createElement('p');
    starEl.replaceWith(mountPoint);
    render(vnode, mountPoint);
  });
});

(() => {
  // 测试页面：https://n.novelia.cc/forum/693160100d2585161e3c68d4
  const entry = ['wenku', 'novel'];
  const providers = PROVIDER_IDS;
  const entryPattern = entry.join('|');
  const providerPattern = providers.join('|');

  // 注意：这里去掉了 ^ 和 $，因为我们要匹配文本中间的链接
  const regexString = `https?:\\/\\/([^\\/]+)\\/(${entryPattern})\\/(${providerPattern})\\/([^\\/]+)(?:\\/([^\\/]+))?\\/?`;
  const dynamicUrlPattern = new RegExp(regexString);

  md.core.ruler.push('rewrite_novel_domains', (state) => {
    const tokens = state.tokens;
    const currentHost = window.location.host ?? 'n.novelia.cc';
    const currentProtocol = window.location.protocol ?? 'https:';
    // 遍历所有 Token
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // 处理自动识别的链接 (linkify 生成的)
      if (token.type === 'inline' && token.children) {
        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j];
          // 标准 markdown-it linkify 产生的是： link_open -> text -> link_close
          if (child.type === 'link_open') {
            const hrefAttr = child.attrs?.find((attr) => attr[0] === 'href');
            if (hrefAttr) {
              const originalUrl = hrefAttr[1];
              const match = originalUrl.match(dynamicUrlPattern);
              if (match) {
                try {
                  const urlObj = new URL(originalUrl);
                  urlObj.host = currentHost;
                  urlObj.protocol = currentProtocol;

                  const newUrl = urlObj.toString();
                  hrefAttr[1] = newUrl; // 修改 href

                  // 同时也修改链接显示的文本 (如果文本和链接一致)
                  // link_open 的下一个 token 通常是 text
                  const nextToken = token.children[j + 1];
                  if (
                    nextToken &&
                    nextToken.type === 'text' &&
                    nextToken.content === originalUrl
                  ) {
                    nextToken.content = newUrl;
                  }
                } catch (e) {
                  console.error('URL Parse Error', e);
                }
              }
            }
          }
        }
      }
    }
  });
})();

const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const href = tokens[idx].attrGet('href');
  if (href && !href.startsWith('#')) tokens[idx].attrSet('target', '_blank');

  return defaultRender(tokens, idx, options, env, self);
};
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <n-el tag="div" class="markdown" v-html="md.render(source)" />
</template>

<style>
.markdown {
  overflow-wrap: break-word;
  word-break: break-word;
}

.markdown a,
.markdown p,
.markdown ul,
.markdown ol,
.markdown li {
  transition: color 0.3s var(--cubic-bezier-ease-in-out);
  line-height: var(--line-height);
  font-size: var(--font-size);
}

.markdown a {
  text-decoration: none;
  color: var(--primary-color);
}
.markdown p {
  margin: 16px 0 16px 0;
  color: var(--text-color-2);
}
.markdown ul,
.markdown ol {
  padding: 0 0 0 2em;
}
.markdown li {
  margin: 0.25em 0 0 0;
  color: var(--text-color-2);
}
.markdown code {
  transition:
    color 0.3s var(--cubic-bezier-ease-in-out) background-color 0.3s
      var(--cubic-bezier-ease-in-out),
    border-color 0.3s var(--cubic-bezier-ease-in-out);
  padding: 0.05em 0.35em 0 0.35em;
  font-size: 0.9em;
  color: var(--text-color-2);
  background-color: var(--code-color);
  border-radius: var(--border-radius-small);
  border: 1px solid #0000;
  line-height: 1.4;
  box-sizing: border-box;
  display: inline-block;
}
.markdown img {
  max-width: 100%;
}
.markdown table {
  display: block;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
}
.markdown th {
  white-space: nowrap;
  background-color: var(--action-color);
}
.markdown th,
.markdown td {
  padding: 12px;
  border-bottom: 1px solid var(--divider-color);
}
.markdown tr th:not(:last-child),
.markdown td:not(:last-child) {
  border-right: 1px solid var(--divider-color);
}

.markdown span[data-hide] {
  background-color: var(--text-color-1);
  transition: color ease 0.2s;
  padding: 0.05em 0.2em;
}

.markdown span[data-hide='true'] {
  color: transparent;
}

.markdown span[data-hide='false'] {
  color: var(--body-color);
}

.markdown span[data-hide='true']:hover,
.markdown span[data-hide='true']:focus {
  color: var(--body-color);
}
</style>
