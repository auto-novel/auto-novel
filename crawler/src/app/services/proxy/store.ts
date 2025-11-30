import { DatabaseSync } from 'node:sqlite';

import type { ProxyConfig, ProxyState } from './manager';
import { z } from 'zod';

const ProxyRowSchema = z.object({
  id: z.number(),
  protocol: z.string(),
  host: z.string(),
  port: z.number(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  fail_count: z.number(),
  success_count: z.number(),
  cooldown_until: z.number().nullable(),
  last_used_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

type ProxyRow = z.infer<typeof ProxyRowSchema>;

type StateUpdatableKeys = keyof Pick<
  ProxyState,
  'failCount' | 'successCount' | 'cooldownUntil' | 'lastUsedAt'
>;

const STATE_COLUMN_MAP: Record<StateUpdatableKeys, string> = {
  failCount: 'fail_count',
  successCount: 'success_count',
  cooldownUntil: 'cooldown_until',
  lastUsedAt: 'last_used_at',
};

type PreparedStatement = ReturnType<DatabaseSync['prepare']>;

const MIGRATION_TABLES = [
  `CREATE TABLE IF NOT EXISTS proxies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        protocol TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        password TEXT,
        fail_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        cooldown_until INTEGER,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      ) STRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_unique ON proxies(protocol, host, port)`,
];
const OPERATIONS = {
  list: `
    SELECT
      id, protocol, host, port, username, password,
      fail_count, success_count, cooldown_until,
      last_used_at, created_at, updated_at
    FROM proxies
    ORDER BY id ASC
  `,
  getById: `
    SELECT
      id, protocol, host, port, username, password,
      fail_count, success_count, cooldown_until,
      last_used_at, created_at, updated_at
    FROM proxies
    WHERE id = ?
  `,
  insert: `
    INSERT INTO proxies (
      protocol, host, port, username, password,
      fail_count, success_count, cooldown_until,
      last_used_at
    )
    VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL)
    ON CONFLICT(protocol, host, port) DO UPDATE SET
      protocol = protocol -- 假更新，为了可以 RETURN ID
    RETURNING id
    `,
  delete: 'DELETE FROM proxies WHERE id = ?',
} as const;

export class ProxyStore {
  private readonly db: DatabaseSync;
  private stmts: Record<keyof typeof OPERATIONS, PreparedStatement>;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    for (const sql of MIGRATION_TABLES) {
      this.db.exec(sql);
    }
    this.stmts = {
      list: this.db.prepare(OPERATIONS.list),
      getById: this.db.prepare(OPERATIONS.getById),
      insert: this.db.prepare(OPERATIONS.insert),
      delete: this.db.prepare(OPERATIONS.delete),
    };
  }

  listSync(): ProxyState[] {
    const rows = ProxyRowSchema.array().parse(this.stmts.list.all());
    return rows.map((row) => this.mapRowToState(row));
  }

  addSync(config: ProxyConfig): ProxyState {
    const result = this.stmts.insert.get(
      config.protocol,
      config.host,
      config.port,
      config.username ?? null,
      config.password ?? null,
    );
    const id = Number(result?.id);
    if (Number.isNaN(id)) {
      throw new Error('Failed to insert proxy');
    }
    const created = this.fetchById(id);
    if (!created) {
      throw new Error('Failed to load proxy after insert');
    }
    return created;
  }

  removeSync(id: number): void {
    this.stmts.delete.run(id);
  }

  updateStateSync(id: number, updates: Partial<ProxyState>): ProxyState | null {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    (Object.keys(STATE_COLUMN_MAP) as StateUpdatableKeys[]).forEach((key) => {
      const value = updates[key];
      if (value !== undefined) {
        assignments.push(`${STATE_COLUMN_MAP[key]} = ?`);
        values.push(value);
      }
    });

    if (updates.config) {
      assignments.push(
        'protocol = ?',
        'host = ?',
        'port = ?',
        'username = ?',
        'password = ?',
      );
      values.push(
        updates.config.protocol,
        updates.config.host,
        updates.config.port,
        updates.config.username ?? null,
        updates.config.password ?? null,
      );
    }

    if (assignments.length === 0) {
      return this.fetchById(id);
    }

    const sql = `
      UPDATE proxies
      SET ${assignments.join(', ')}, updated_at = unixepoch() * 1000
      WHERE id = ?
    `;
    this.db.prepare(sql).run(...values, id);
    return this.fetchById(id);
  }

  getByIdSync(id: number): ProxyState | null {
    return this.fetchById(id);
  }

  close(): void {
    this.db.close();
  }

  private fetchById(id: number): ProxyState | null {
    const row = this.stmts.getById.get(id);
    if (!row) {
      return null;
    }
    const parsed = ProxyRowSchema.parse(row);
    return this.mapRowToState(parsed);
  }

  private mapRowToState(row: ProxyRow): ProxyState {
    return {
      id: row.id,
      config: {
        protocol: row.protocol as ProxyConfig['protocol'],
        host: row.host,
        port: row.port,
        username: row.username ?? undefined,
        password: row.password ?? undefined,
      },
      failCount: row.fail_count,
      successCount: row.success_count,
      cooldownUntil: row.cooldown_until,
      lastUsedAt: row.last_used_at,
    };
  }
}
