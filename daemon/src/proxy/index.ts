/*
  Proxy pool implementation
  auto select and manage proxies for web requests
*/
import ky from 'ky';
import { Persist } from './db';

type Proxy = {
  address: string;
  type: 'http' | 'https' | 'socks5';
};

type Callback<T> = (fetch: typeof ky) => Promise<T>;

export class ProxyPool {
  pool: Map<string, string> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Persist<string, any>;

  constructor(dbPath: string) {
    this.db = new Persist(dbPath);
  }

  addProxy(proxy: string): void {
    throw new Error('Method not implemented.');
  }

  removeProxy(proxy: string): void {
    throw new Error('Method not implemented.');
  }

  selectProxy(): string {
    throw new Error('Method not implemented.');
  }

  fetch<T>(callback: Callback<T>): Promise<Response> {
    throw new Error('Method not implemented.');
  }
}
