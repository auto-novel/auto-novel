import { checkIsMobile } from '@/util';

export function getFakeDesktopUA(): string {
  const ua = navigator.userAgent;
  if (!checkIsMobile()) {
    return ua;
  }

  const appleWebKitVersion =
    ua.match(/\bAppleWebKit\/([\d.]+)/i)?.[1] ?? '537.36';
  const safariVersion =
    ua.match(/\bSafari\/([\d.]+)/i)?.[1] ?? appleWebKitVersion;
  const chromiumLike = (version: string) =>
    `AppleWebKit/${appleWebKitVersion} (KHTML, like Gecko) Chrome/${version} Safari/${safariVersion}`;

  const edge = ua.match(/\b(?:EdgA|EdgiOS)\/([\d.]+)/i);
  if (edge !== null) {
    const chrome = ua.match(/\b(?:Chrome|CriOS)\/([\d.]+)/i);
    const chromiumVersion = chrome?.[1] ?? edge[1];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chromiumLike(chromiumVersion)} Edg/${edge[1]}`;
  }

  const chrome = ua.match(/\b(?:Chrome|CriOS)\/([\d.]+)/i);
  if (chrome !== null) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chromiumLike(chrome[1])}`;
  }

  const firefox = ua.match(/\b(?:Firefox|FxiOS)\/([\d.]+)/i);
  if (firefox !== null) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${firefox[1]}) Gecko/20100101 Firefox/${firefox[1]}`;
  }

  return ua
    .replace(
      /\([^)]*(?:Android|iPhone|iPad|iPod)[^)]*\)/i,
      '(Windows NT 10.0; Win64; x64)',
    )
    .replace(/\sMobile(?:\/\w+)?(?=\s|$)/i, '')
    .replace(/\bCriOS\//i, 'Chrome/')
    .replace(/\bEdgA\//i, 'Edg/')
    .replace(/\bEdgiOS\//i, 'Edg/')
    .replace(/\bFxiOS\//i, 'Firefox/');
}

export function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}
