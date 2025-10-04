import type { ClientMethods } from '@rpc/client/client.types';

export enum MSG_TYPE {
  CRAWLER_REQ = 'AUTO_NOVEL_CRAWLER_REQUEST',
  RESPONSE = 'AUTO_NOVEL_CRAWLER_RESPONSE',
  PING = 'AUTO_NOVEL_CRAWLER_PING',
}

interface BaseMessage {
  type: MSG_TYPE;
  id?: string;
}

export interface MSG_PING extends BaseMessage {
  type: MSG_TYPE.PING;
}

export interface MSG_CRAWLER extends BaseMessage {
  type: MSG_TYPE.CRAWLER_REQ;
  payload: AutoNovelCrawlerCommand;
}

export interface MSG_RESPONSE extends BaseMessage {
  type: MSG_TYPE.RESPONSE;
  payload: ResponsePayload;
}

export type ResponsePayload = {
  success: boolean;
  result?: any;
  error?: string;
};

export type Message = MSG_PING | MSG_CRAWLER | MSG_RESPONSE;

export type AutoNovelCrawlerCommand = {
  base_url: string;
  single?: boolean; // auto call close() after command
  job_id?: string;
  cmd: keyof ClientMethods;
  params?: any;
};
