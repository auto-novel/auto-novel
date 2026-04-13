import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export function stripPrefix(str: string, prefix: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length);
  }
  return str;
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
  } catch (error) {
    console.error(
      `日期解析失败: pattern='${pattern}', dateString='${dateString}'`,
      error,
    );
    return undefined;
  }
}
