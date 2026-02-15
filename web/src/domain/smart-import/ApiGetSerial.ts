import { AmazonApi } from '@/api';
import { extractAsin } from './Common';
import { resolveKindleAsin } from './ApiGetProduct';

const parseSerial = (doc: Document) => {
  const authorsSet = new Set<string>();
  const artistsSet = new Set<string>();
  doc.querySelectorAll('[data-action="a-popover"]').forEach((element) => {
    element
      .getAttribute('data-a-popover')!
      .split('\\n')
      .map((it) => it.trim())
      .forEach((contribution) => {
        if (contribution.endsWith('(著)')) {
          authorsSet.add(contribution.replace(/(\(著\))$/, '').trim());
        } else if (contribution.endsWith('(イラスト)')) {
          artistsSet.add(contribution.replace(/(\(イラスト\))$/, '').trim());
        }
      });
  });
  Array.from(
    doc.getElementsByClassName('series-childAsin-item-details-contributor'),
  ).forEach((element) => {
    const contribution = element.textContent!.trim().replace(/(,)$/, '').trim();
    if (contribution.endsWith('(著)')) {
      authorsSet.add(contribution.replace(/(\(著\))$/, '').trim());
    } else if (contribution.endsWith('(イラスト)')) {
      artistsSet.add(contribution.replace(/(\(イラスト\))$/, '').trim());
    }
  });

  const authors = [...authorsSet].filter((it) => !artistsSet.has(it));
  const artists = [...artistsSet];

  const volumes = Array.from(
    doc.getElementById('series-childAsin-batch_1')!.children,
  ).map((it) => {
    const titleLink = it.getElementsByClassName(
      'a-size-base-plus a-link-normal itemBookTitle a-text-bold',
    )[0]!;
    const asin = extractAsin(titleLink.getAttribute('href')!)!;
    const title = titleLink.textContent!;
    const cover = it.getElementsByTagName('img')[0].getAttribute('src')!;
    return { asin, title, cover };
  });

  return { authors, artists, volumes };
};

export const getSerial = async (asin: string, total: string) => {
  const result = await AmazonApi.getSerial(asin, total).then(parseSerial);
  result.volumes = await Promise.all(
    result.volumes.map(async (v) => {
      if (!v.asin.startsWith('B')) {
        return { ...v, asin: await resolveKindleAsin(v.asin) };
      }
      return v;
    }),
  );
  return result;
};
