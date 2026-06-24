import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';
import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import type { KyInstance } from 'ky';

import { CrawlerAuthError, CrawlerHttpError } from '@/errors';

import { WebNovelAttention } from './types';

export function assertNoCFChallenge(html: string): void {
  if (
    html.includes('#challenge-error-text') ||
    html.includes('cf-browser-verification') ||
    html.includes('Just a moment...') ||
    html.includes('Attention Required!')
  ) {
    throw new CrawlerAuthError(
      '触发 Cloudflare 人机验证，请先访问小说原站完成人机验证后再重试',
    );
  }
}

export function assertNoAWSChallenge(html: string): void {
  if (
    html.includes('challenge-container') ||
    html.includes(
      "In order to continue, we need to verify that you're not a robot",
    ) ||
    html.includes('challenge.js')
  ) {
    throw new CrawlerAuthError(
      '触发 CloudFront 人机验证，请先访问小说原站完成人机验证后再重试',
    );
  }
}

export async function fetchDocument(
  client: KyInstance,
  url: string,
): Promise<CheerioAPI> {
  const resp = await client.get(url, { throwHttpErrors: false });
  const text = await resp.text();

  assertNoCFChallenge(text);

  if (!resp.ok) {
    throw new CrawlerHttpError(
      `获取页面失败：${resp.status} ${resp.statusText} (${url})`,
      resp.status,
      url,
    );
  }

  return cheerio.load(text);
}

export const removeSuffix = (suffix: string) => (input: string) =>
  input.endsWith(suffix) ? input.slice(0, -suffix.length) : input;

export const removePrefix = (prefix: string) => (input: string) =>
  input.startsWith(prefix) ? input.slice(prefix.length) : input;

export const substringAfterLast = (delimiter: string) => (input: string) => {
  const index = input.lastIndexOf(delimiter);
  return index === -1 ? input : input.slice(index + delimiter.length);
};

export function stringToAttentionEnum(tag: string): WebNovelAttention | null {
  switch (tag) {
    case 'R15':
    case 'R-15':
      return WebNovelAttention.R15;
    case 'R18':
    case 'R-18':
      return WebNovelAttention.R18;
    case '残酷描写有り':
    case '残酷描写あり':
    case '残酷な描写':
    case '残酷な描写あり':
      return WebNovelAttention.Cruelty;
    case '暴力描写有り':
    case '暴力描写あり':
      return WebNovelAttention.Violence;
    case '性描写有り':
    case '性的表現あり':
      return WebNovelAttention.SexualContent;
    default:
      return null;
  }
}

export function numExtractor(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    return null;
  }

  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function parseJapanDateString(
  pattern: string,
  dateString: string,
): Date | undefined {
  try {
    const naiveDate = parse(dateString, pattern, new Date());
    const utcDate = fromZonedTime(naiveDate, 'Asia/Tokyo');
    if (isNaN(utcDate.getTime())) {
      return undefined;
    }
    return utcDate;
  } catch {
    return undefined;
  }
}
