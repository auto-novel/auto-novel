type Tab = chrome.tabs.Tab;

export type SerializableResponse = {
  body: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: [string, string][];
  redirected: boolean;
  url: string;
  type: ResponseType;
};

export interface SerializableRequest {
  url: string;
  // RequestInit 的所有可序列化属性
  method: string;
  headers?: [string, string][];
  body?: string; // base64 encoded body
  mode?: RequestMode;
  credentials: RequestCredentials;
  cache: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  integrity?: string;
}
export async function serializeRequest(
  request: RequestInfo,
): Promise<SerializableRequest | string> {
  if (typeof request === 'string') {
    return request;
  }

  const headers: [string, string][] = Array.from(request.headers.entries());
  console.log('serializeRequest: ', headers);

  const req: SerializableRequest = {
    url: request.url,
    method: request.method,
    headers,
    body: request.body ? await request.text() : undefined,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    integrity: request.integrity,
  };
  return req;
}
export function deserializeRequest(req: SerializableRequest): RequestInfo {
  if (typeof req === 'string') {
    return req;
  }

  console.log('deserializeRequest: ', req);
  const init: RequestInit = {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.body,
    mode: req.mode,
    credentials: req.credentials,
    cache: req.cache,
    redirect: req.redirect,
    referrer: req.referrer,
    integrity: req.integrity,
  };

  return new Request(req.url, init);
}

export type HttpFetchParams = {
  input: SerializableRequest | string;
  requestInit?: RequestInit;
};
export type HttpFetchResult = SerializableResponse;

export type HttpGetParams = {
  url: string;
  params?: Record<string, string>;
  headers?: [string, string][];
};
export type HttpGetResult = SerializableResponse;

export type HttpPostJsonParams = {
  url: string;
  data?: Record<string, string>;
  headers?: [string, string][];
};
export type HttpPostJsonResult = SerializableResponse;

export type TabSwitchToParams = {
  url: string;
};
export type TabSwitchToResult = void;

export type TabHttpFetchParams = {
  input: SerializableRequest | string;
  requestInit?: RequestInit;
};
export type TabHttpFetchResult = SerializableResponse;

export type TabHttpGetParams = {
  url: string;
  params?: Record<string, string>;
};
export type TabHttpGetResult = SerializableResponse;

export type TabHttpPostJsonParams = {
  url: string;
  data?: Record<string, string>;
  headers?: [string, string][];
};
export type TabHttpPostJsonResult = SerializableResponse;

export type CookiesGetParams = {
  url: string;
};
export type CookiesGetResult = chrome.cookies.Cookie[];

export type DomQuerySelectorAllParams = {
  selector: string;
};
export type DomQuerySelectorAllResult = string[];

export type JobNewParams = void;
export type JobNewResult = { job_id: string };

export type JobQuitParams = void;
export type JobQuitResult = {
  status: 'completed' | 'failed' | 'canceled' | 'ignored';
  reason?: string;
};

// export type CtlQuitParams = {
//   worker_id: WorkerId;
// };
// export type CtrlQuitResult = void;

export type BypassEnableParams = {
  url: string;
  origin?: string;
  referer?: string;
};
export type BypassEnableResult = void;

export type ClientMethods = {
  'base.ping'(): Promise<string>;

  'local.bypass.enable'(
    params: BypassEnableParams,
  ): Promise<BypassEnableResult>;
  'local.bypass.disable'(params: { url: string }): Promise<void>;

  'http.fetch'(params: HttpFetchParams): Promise<HttpFetchResult>;
  'http.get'(params: HttpGetParams): Promise<HttpGetResult>;
  'http.postJson'(params: HttpPostJsonParams): Promise<HttpPostJsonResult>;

  'tab.switchTo'(params: TabSwitchToParams): Promise<TabSwitchToResult>;
  'tab.http.fetch'(params: TabHttpFetchParams): Promise<TabHttpFetchResult>;
  'tab.http.get'(params: TabHttpGetParams): Promise<TabHttpGetResult>;
  'tab.http.postJson'(
    params: TabHttpPostJsonParams,
  ): Promise<TabHttpPostJsonResult>;
  'tab.dom.querySelectorAll'(
    params: DomQuerySelectorAllParams,
  ): Promise<DomQuerySelectorAllResult>;

  'cookies.get'(params: CookiesGetParams): Promise<CookiesGetResult>;

  'dom.querySelectorAll'(
    params: DomQuerySelectorAllParams,
  ): Promise<DomQuerySelectorAllResult>;

  'job.new'(params: JobNewParams): Promise<JobNewResult>;
  'job.quit'(params: JobQuitParams): Promise<JobQuitResult>;

  // NOTE(kuriko): 基于同一个 ws 连接进行多路复用可能会更优雅一些，但是实现起来比较麻烦，
  //  暂时按照每个爬虫任务一条 ws 连接来做。
  // "ctl.quit"(params: CtlQuitParams): Promise<CtrlQuitResult>;
};
