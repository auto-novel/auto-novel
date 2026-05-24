import { checkIsMobile } from '@/util';

function getFakeDesktopUA(): string {
  const ua = navigator.userAgent;

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

export function toHeaders(headers?: HeadersInit): Record<string, string> {
  const headerDict: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    headerDict[key] = value;
  });
  return headerDict;
}

export function fakeDesktopHeader(headers: Record<string, string>): void {
  if (checkIsMobile()) {
    headers['User-Agent'] = getFakeDesktopUA();
    headers['Viewport-Width'] = '2560';
  }
}
