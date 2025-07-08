import { Epub } from './epub';
import { Txt } from './txt';

namespace NovelMark {
  export const fromXhtml = (node: Node): string => {
    let text = '';
    const ensureNewLine = () => {
      if (!text.endsWith('\n')) text += '\n';
    };
    const xhtmlToTextInner = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent?.replaceAll(/^[ \n]+|[ \n]+$/g, '') || '';
      } else if (node instanceof Element) {
        const tagName = node.tagName.toLowerCase();
        const blockTag = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'];
        const skipTag = ['rp', 'rt'];
        const imageTag = 'img';

        if (tagName === imageTag) {
          const src = node.getAttribute('src')?.trim();
          if (!src) return;
          ensureNewLine();
          text += `<图片>${src}\n`;
        } else if (skipTag.includes(tagName)) {
          return;
        } else {
          if (blockTag.includes(tagName)) ensureNewLine();
          node.childNodes.forEach((child) => {
            xhtmlToTextInner(child);
          });
          if (blockTag.includes(tagName)) ensureNewLine();
        }
      }
    };
    xhtmlToTextInner(node);
    ensureNewLine();
    return text;
  };

  export const toXhtml = (doc: Document, mark: string): Element[] => {
    const elements: Element[] = [];
    for (const line of mark.split('\n')) {
      if (line.startsWith('<图片>')) {
        const el = doc.createElement('img');
        el.setAttribute('src', line.slice('<图片>'.length));
        elements.push(el);
      } else if (line.startsWith('<分割线>')) {
        const el = doc.createElement('hr');
        elements.push(el);
      } else {
        const el = document.createElement('p');
        const text = document.createTextNode(line);
        el.appendChild(text);
        elements.push(el);
      }
    }
    return elements;
  };

  export const fromText = (text: string): string => {
    const buf: string[] = [];
    for (const line of text.split('\n')) {
      if (line === '--------') {
        buf.push('<分割线>');
      } else {
        buf.push(line);
      }
    }
    return buf.join('\n');
  };

  export const toText = (nml: string): string => {
    const buf: string[] = [];
    for (const line of nml.split('\n')) {
      if (line.startsWith('<分割线>')) {
        buf.push('--------');
      } else {
        buf.push(line);
      }
    }
    return buf.join('\n');
  };
}

export interface StandardChapter {
  id: string;
  title: string;
  content: string;
}

export interface StandardNovel {
  id: string;
  title: string;
  chapters: StandardChapter[];
}

export namespace StandardNovel {
  const removeExt = (str: string, ext: string) => {
    if (str.toLowerCase().endsWith(ext)) {
      return str.slice(0, -ext.length);
    }
    return str;
  };

  export const fromEpub = (epub: Epub): StandardNovel => {
    const chapters: StandardChapter[] = [];

    const traverseToc = (navItems: typeof epub.navItems) => {
      for (const item of navItems) {
        if (item.children.length > 0) {
          traverseToc(item.children);
        } else if (
          item.href &&
          chapters.find((it) => it.id === item.href) === undefined
        ) {
          chapters.push({
            id: item.href,
            title: item.text,
            content: '',
          });
        }
      }
    };
    traverseToc(epub.navItems);

    let index = -1;
    for (const item of epub.iterDocInSpine()) {
      if (index + 1 < chapters.length && item.path == chapters[index + 1].id) {
        index += 1;
      }
      if (index >= 0) {
        chapters[index].content += NovelMark.fromXhtml(item.doc.body);
      }
    }

    return {
      id: epub.name,
      title: removeExt(epub.name, '.epub'),
      chapters,
    };
  };

  export const toTxt = async (novel: StandardNovel): Promise<Txt> => {
    const buf: string[] = [];
    buf.push(`${novel.title}\n\n\n`);

    for (const chapter of novel.chapters) {
      buf.push(`# ${chapter.title}\n`);
      buf.push(NovelMark.toText(chapter.content));
    }
    return Txt.fromText(
      removeExt(novel.title, '.epub') + '.txt',
      buf.join('\n'),
    );
  };
}
