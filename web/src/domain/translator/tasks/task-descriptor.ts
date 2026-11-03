export type WebTranslateTaskDesc = {
  type: 'web';
  providerId: string;
  novelId: string;
};

export type WenkuTranslateTaskDesc = {
  type: 'wenku';
  novelId: string;
  volumeId: string;
};

export type LocalTranslateTaskDesc = {
  type: 'local';
  volumeId: string;
};

export type TranslateTaskDesc =
  | WebTranslateTaskDesc
  | WenkuTranslateTaskDesc
  | LocalTranslateTaskDesc;

export type TranslateTaskParams = {
  level: 'normal' | 'expire' | 'all' | 'sync'; // 翻译等级
  forceMetadata: boolean; // 强制重翻元数据
  useBrowserCrawler: boolean; // 是否启用浏览器爬虫
  startIndex: number;
  endIndex: number;
};

type TranslateTaskDescriptor = string;

export namespace TranslateTaskDescriptor {
  const buildTaskQueryString = ({
    level,
    forceMetadata,
    useBrowserCrawler,
    startIndex,
    endIndex,
  }: TranslateTaskParams) => {
    const searchParamsInit: { [key: string]: string } = {
      level,
      forceMetadata: forceMetadata.toString(),
      useBrowserCrawler: useBrowserCrawler.toString(),
      startIndex: startIndex.toString(),
      endIndex: endIndex.toString(),
    };
    const searchParams = new URLSearchParams(searchParamsInit).toString();
    return searchParams ? `?${searchParams}` : '';
  };

  export const web = (
    providerId: string,
    novelId: string,
    params: TranslateTaskParams,
  ) => `web/${providerId}/${novelId}` + buildTaskQueryString(params);

  export const wenku = (
    novelId: string,
    volumeId: string,
    params: TranslateTaskParams,
  ) =>
    `wenku/${novelId}/${encodeURIComponent(volumeId)}` +
    buildTaskQueryString(params);

  export const local = (volumeId: string, params: TranslateTaskParams) =>
    `local/${encodeURIComponent(volumeId)}` + buildTaskQueryString(params);

  export const parse = (task: string) => {
    const [taskString, queryString] = task.split('?');

    let desc: TranslateTaskDesc;
    if (taskString.startsWith('web/')) {
      const [_, providerId, novelId] = taskString.split('/');
      desc = { type: 'web', providerId, novelId };
    } else if (taskString.startsWith('wenku/')) {
      const [_, novelId, volumeId] = taskString.split('/');
      desc = {
        type: 'wenku',
        novelId,
        volumeId: decodeURIComponent(volumeId),
      };
    } else if (
      taskString.startsWith('local/') ||
      taskString.startsWith('personal/') ||
      taskString.startsWith('personal2/')
    ) {
      const [_, volumeId] = taskString.split('/');
      desc = { type: 'local', volumeId: decodeURIComponent(volumeId) };
    } else {
      throw 'quit';
    }

    const query = new URLSearchParams(queryString);

    const queryBoolean = (name: string) => {
      return query.get(name) === 'true';
    };

    const queryInt = (name: string, defaultValue: number) => {
      const num = parseInt(query.get(name)!, 10);
      return isNaN(num) ? defaultValue : num;
    };

    const params: TranslateTaskParams = {
      level: query.get('level') as 'normal' | 'expire' | 'all' | 'sync',
      forceMetadata: queryBoolean('forceMetadata'),
      useBrowserCrawler: queryBoolean('useBrowserCrawler'),
      startIndex: queryInt('startIndex', 0),
      endIndex: queryInt('endIndex', 65535),
    };

    return { desc, params };
  };
}
