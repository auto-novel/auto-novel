import type { AmazonNovel, WenkuVolumeDto } from '@/model/WenkuNovel';
import { parallelExec } from '@/util';

import { getProduct } from './ApiGetProduct';
import { getSerial } from './ApiGetSerial';
import { search } from './ApiSearch';
import { extractAsin, prettyCover } from './Common';
import { Translator } from '../translate';

type Logger = (message: string) => void;

type SmartImportCallback = {
  log: Logger;
  populateNovel: (novel: AmazonNovel) => void;
  populateVolume: (volume: WenkuVolumeDto) => void;
};

const parseTitle = (title: string) => {
  // 替换全角空格
  title.replaceAll('　', ' ');

  const irrelevantKeywords = [
    '特典',
    '限定', // 例如：【電子書籍限定書き下ろしSS付き】 https://www.amazon.co.jp/zh/dp/B0CJ2G42MK
  ];

  const imprintKeywords = [
    '文庫',
    'book',
    'novel',
    'fiction',
    'ノベル',
    'ブックス',
    //
    '電撃の新文芸',
    'サーガフォレスト',
    'ムーンドロップス',
    '蜜猫ｎｏｖｅｌｓ',
    'ベリーズファンタジー',
    'アルファポリス',
    'アイリスNEO',
    'メリッサ',
    'フォーユー出版',
    '濃蜜ラブルージュ',
    '講談社タイガ',
    '集英社文芸単行本',
    'ストレートエッジ',
    '講談社ＢＯＸ',
    '光文社新書',
  ];

  const includeIrrelevantKeywords = (s: string) =>
    irrelevantKeywords.some((it) => s.includes(it));
  const includeImprintKeywords = (s: string) =>
    imprintKeywords.some((it) =>
      s.toLocaleLowerCase().includes(it.toLocaleLowerCase()),
    );

  let imprint;
  for (const [matched, content] of title.matchAll(
    /[【（(]([^)）】]*)[)）】]/g,
  )) {
    if (includeIrrelevantKeywords(content)) {
      title = title.replace(matched, '');
    } else if (includeImprintKeywords(content)) {
      title = title.replace(matched, '');
      // 例如：(電撃文庫 か 5-17) https://www.amazon.co.jp/-/zh/dp/4840224072
      imprint = content.trim().replace(/\s+[\u3040-\u30FF]\s+\d+-\d+/, '');
    }
  }
  for (const part of title.split(' ')) {
    if (includeImprintKeywords(part)) {
      title = title.replace(part, '');
      imprint = part;
    }
  }
  title = title.trim();
  return { title, imprint };
};

const checkIsNovelByTitle = (title: string) => {
  const titleKeywords = [
    '試し読', // 试读，例如：https://www.amazon.co.jp/dp/B0BTDKR5LZ
    '分冊版', // 漫画，例如：https://www.amazon.co.jp/dp/B08CRKP52T
    'コミックライド', // 漫画文库，例如：https://www.amazon.co.jp/dp/B0CGR4GB8H
    'グラストCOMICS', //  漫画文库，例如：https://www.amazon.co.jp/dp/B09D7DD219
    'ゼノンコミックス', // 漫画文库，https://www.amazon.co.jp/zh/dp/B09PR85NJG
    '巻セット', // 系列，例如：https://www.amazon.co.jp/dp/B0CLBTVDLP
  ];
  if (titleKeywords.some((it) => title.includes(it))) {
    return false;
  }
  return true;
};

const checkIsNovelByDetail = (otherVersion: string[], breadcrumbs: string) => {
  const otherVersionKeywords = [
    'コミック', // 例如：https://www.amazon.co.jp/dp/B09Z9XB924
  ];
  for (const keyword of otherVersionKeywords) {
    if (otherVersion.some((it) => it.includes(keyword))) {
      return false;
    }
  }

  const breadcrumbsKeywords = [
    'コミック', // 例如：https://www.amazon.co.jp/dp/B0C6QLX6MR
  ];
  if (breadcrumbsKeywords.some((it) => breadcrumbs.includes(it))) {
    return false;
  }

  return true;
};

const getNovelFromVolumes = async (volumes: WenkuVolumeDto[]) => {
  const metadata = await getNovelByAsin(volumes[0].asin);
  metadata.volumes = volumes.map((v) => {
    const { title, imprint } = parseTitle(v.title);
    const cover = prettyCover(v.cover);
    return { asin: v.asin, title, cover, imprint };
  });
  return metadata;
};

const getNovelByAsin = async (asin: string): Promise<AmazonNovel> => {
  const product = await getProduct(asin);
  if (product.type === 'volume') {
    const volume = product.volume;
    const { title, imprint } = parseTitle(volume.title);
    const cover = prettyCover(volume.cover);
    return {
      title,
      r18: volume.r18,
      authors: volume.authors,
      artists: volume.artists,
      introduction: volume.introduction,
      volumes: [{ asin, title, cover, imprint }],
    };
  } else if (product.type === 'serial') {
    const { title, total } = product.serial;
    const serial = await getSerial(asin, total);
    const novel = await getNovelFromVolumes(serial.volumes);
    if (title !== undefined) {
      novel.title = title;
    }
    return novel;
  } else {
    return getNovelFromVolumes(product.set.volumes);
  }
};

const getNovelBySearch = async (
  query: string,
  log: Logger,
): Promise<AmazonNovel> => {
  log(`导入小说 开始搜索\n`);
  const searchItems = (await search(query))
    .filter(({ title }) => title.includes(query) && checkIsNovelByTitle(title))
    .sort((a, b) => a.title.localeCompare(b.title));

  const serialAsinSet = new Set<string>();
  for (const { asin, serialAsin } of searchItems) {
    if (serialAsin === undefined || serialAsinSet.has(serialAsin)) {
      continue;
    }
    serialAsinSet.add(serialAsin);

    log(`尝试导入小说系列 ${serialAsin}`);
    const product = await getProduct(asin);
    if (
      product.type !== 'volume' ||
      !checkIsNovelByDetail(
        product.volume.otherVersion,
        product.volume.breadcrumbs,
      )
    ) {
      log('检测系列不是小说，跳过\n');
      continue;
    }
    return getNovelByAsin(serialAsin);
  }

  const volumes = searchItems.filter(
    ({ serialAsin }) => serialAsin === undefined,
  );
  if (volumes.length === 0) {
    throw Error('搜索结果为空');
  }

  log('导入搜索结果\n');
  return getNovelFromVolumes(volumes);
};

const getVolume = async (asin: string) => {
  const product = await getProduct(asin);
  if (product.type !== 'volume') {
    throw new Error(`ASIN不对应小说:${asin}`);
  }
  const { title, cover, coverHires, publisher, publishAt } = product.volume;
  const { title: realTitle, imprint } = parseTitle(title);
  return <WenkuVolumeDto>{
    asin,
    title: realTitle,
    cover: prettyCover(cover),
    coverHires: coverHires ? prettyCover(coverHires) : null,
    publisher,
    imprint,
    publishAt,
  };
};

export const smartImport = async (
  urlOrQuery: string,
  volumes: WenkuVolumeDto[],
  forcePopulateVolumes: boolean,
  callback: SmartImportCallback,
) => {
  const { log, populateNovel, populateVolume } = callback;

  if (urlOrQuery.length > 0) {
    let novel: AmazonNovel;
    try {
      const asin = extractAsin(urlOrQuery);
      if (asin === undefined) {
        novel = await getNovelBySearch(urlOrQuery, log);
      } else {
        log(`导入小说 ${asin}\n`);
        novel = await getNovelByAsin(asin);
      }
    } catch (e) {
      log(`导入小说失败：${e}`);
      return;
    }
    const volumesNew = novel.volumes.filter(
      (newV) => !volumes.some((oldV) => oldV.asin === newV.asin),
    );
    volumes = volumes.concat(volumesNew);
    novel.volumes = volumes;

    try {
      const translator = await Translator.create({ id: 'youdao' });
      const titleZh = await translator.translatePlain(novel.title);
      const introductionZh = await translator.translatePlain(
        novel.introduction,
      );
      novel.titleZh = titleZh;
      novel.introduction = introductionZh;
    } catch {}

    populateNovel(novel);
  }

  const volumesNeedPopulate = volumes.filter(
    ({ coverHires, publishAt }) =>
      [coverHires, publishAt].some((it) => it === undefined) ||
      forcePopulateVolumes,
  );

  await parallelExec(
    volumesNeedPopulate.map(({ asin }) => {
      return () =>
        getVolume(asin)
          .then((newVolume) => {
            populateVolume(newVolume);
          })
          .catch((e) => {
            log(`导入分卷失败 ${asin} ${e}`);
          });
    }),
    5,
    (context) => {
      const processing = context.promises.length;
      const finished = context.finished;
      const size = volumesNeedPopulate.length;
      log(`导入分卷[${finished}/${size}] ${processing}本处理中`);
    },
  );

  log('\n结束');
};
