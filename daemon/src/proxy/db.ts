/*
  TODO(kuriko): currently we use a json cache, flush to disk every 5min.
*/

import fs from 'fs/promises';
import path from 'path';
import { Mutex } from 'async-mutex';

export class Persist<K, V> {
  readonly FlushInterval = 5 * 60;

  lastUpdate: number = 0;

  readonly dataPath: string;
  data: Map<K, V> = new Map();

  mutex: Mutex = new Mutex();

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  async set(key: K, value: V) {
    this.mutex.runExclusive(async () => {
      this.data.set(key, value);
    });

    const now = new Date().getTime();
    if (now - this.lastUpdate > this.FlushInterval) {
      // Update lastUpdate first to avoid multiple flushes
      this.lastUpdate = now;

      // flush to disk every FlushInterval
      const data = structuredClone(this.data);
      const dataStr = JSON.stringify(data);
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.dataPath, dataStr);
    }
  }

  async get(key: K): Promise<V | null> {
    return this.mutex.runExclusive(async () => {
      return this.data.get(key) ?? null;
    });
  }
}
