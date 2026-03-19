export type DataKey = {
  // Incase of duplication.
  id?: string;
  url: string;
  method?: 'GET' | 'POST';
};

export class OnceMap<K, V> {
  private data: Map<K, V> = new Map();

  set(key: K, value: V): void {
    if (!this.data.has(key)) {
      this.data.set(key, value);
    } else {
      throw new Error('Key already exists in OnceMap');
    }
  }

  addData(other: OnceMap<K, V>): void {
    for (const [key, value] of other.data.entries()) {
      this.set(key, value);
    }
  }

  toString(): string {
    return JSON.stringify(this.data);
  }
}

export type CrawlerDataSource = {
  providerId: string;
  version: string;
  data: OnceMap<DataKey, string>;
};
