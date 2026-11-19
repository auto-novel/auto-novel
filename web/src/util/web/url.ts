interface Provider {
  parseUrl(url: string): string | undefined;
  buildNovelUrl(novelId: string): string;
  buildChapterUrl(novelId: string, chapterId: string): string;
}

const kakuyomu: Provider = {
  parseUrl(url: string): string | undefined {
    return /kakuyomu\.jp\/works\/([0-9]+)/.exec(url)?.[1];
  },
  buildNovelUrl(novelId: string): string {
    return `https://kakuyomu.jp/works/${novelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    return `https://kakuyomu.jp/works/${novelId}/episodes/${chapterId}`;
  },
};

const syosetu: Provider = {
  parseUrl(url: string): string | undefined {
    return /syosetu\.com\/([A-Za-z0-9]+)/.exec(url)?.[1].toLowerCase();
  },
  buildNovelUrl(novelId: string): string {
    return `https://ncode.syosetu.com/${novelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    if (chapterId == 'default') {
      return `https://ncode.syosetu.com/${novelId}`;
    } else {
      return `https://ncode.syosetu.com/${novelId}/${chapterId}`;
    }
  },
};

const novelup: Provider = {
  parseUrl(url: string): string | undefined {
    return /novelup\.plus\/story\/([0-9]+)/.exec(url)?.[1];
  },
  buildNovelUrl(novelId: string): string {
    return `https://novelup.plus/story/${novelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    return `https://novelup.plus/story/${novelId}/${chapterId}`;
  },
};

const hameln: Provider = {
  parseUrl(url: string): string | undefined {
    return /syosetu\.org\/novel\/([0-9]+)/.exec(url)?.[1];
  },
  buildNovelUrl(novelId: string): string {
    return `https://syosetu.org/novel/${novelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    if (chapterId == 'default') {
      return `https://syosetu.org/novel/${novelId}/`;
    } else {
      return `https://syosetu.org/novel/${novelId}/${chapterId}.html`;
    }
  },
};

const pixiv: Provider = {
  parseUrl(url: string): string | undefined {
    let novelId = /pixiv\.net\/novel\/series\/([0-9]+)/.exec(url)?.[1];
    if (novelId === undefined) {
      novelId = /pixiv\.net\/novel\/show.php\?id=([0-9]+)/.exec(url)?.[1];
      if (novelId !== undefined) {
        novelId = 's' + novelId;
      }
    }
    return novelId;
  },
  buildNovelUrl(novelId: string): string {
    if (novelId[0] === 's') {
      return `https://www.pixiv.net/novel/show.php?id=${novelId.substring(1)}`;
    } else {
      return `https://www.pixiv.net/novel/series/${novelId}`;
    }
  },
  buildChapterUrl(_novelId: string, chapterId: string): string {
    return `https://www.pixiv.net/novel/show.php?id=${chapterId}`;
  },
};

const alphapolis: Provider = {
  parseUrl(url: string): string | undefined {
    const matched = /www\.alphapolis\.co\.jp\/novel\/([0-9]+)\/([0-9]+)/.exec(
      url,
    );
    if (matched) {
      return `${matched[1]}-${matched[2]}`;
    } else {
      return undefined;
    }
  },
  buildNovelUrl(novelId: string): string {
    const realNovelId = novelId.replace('-', '/');
    return `https://www.alphapolis.co.jp/novel/${realNovelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    const realNovelId = novelId.replace('-', '/');
    return `https://www.alphapolis.co.jp/novel/${realNovelId}/episode/${chapterId}`;
  },
};

// 弃用，为了兼容以前的小说暂时保留
const novelism: Provider = {
  parseUrl(_url: string): string | undefined {
    return undefined;
  },
  buildNovelUrl(novelId: string): string {
    return `https://novelism.jp/novel/${novelId}`;
  },
  buildChapterUrl(novelId: string, chapterId: string): string {
    return `https://novelism.jp/novel/${novelId}/article/${chapterId}/`;
  },
};

const providers: { [id: string]: Provider } = {
  kakuyomu,
  syosetu,
  novelup,
  hameln,
  pixiv,
  alphapolis,
  novelism,
};

export const parseUrl = (url: string) => {
  for (const providerId in providers) {
    const provider = providers[providerId];
    const novelId = provider.parseUrl(url);
    if (novelId !== undefined) {
      return { providerId, novelId };
    }
  }
  return undefined;
};

export const buildNovelUrl = (providerId: string, novelId: string) =>
  providers[providerId].buildNovelUrl(novelId);

export const buildChapterUrl = (
  providerId: string,
  novelId: string,
  chapterId: string,
) => providers[providerId].buildChapterUrl(novelId, chapterId);
