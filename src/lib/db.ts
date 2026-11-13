import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';

export type Row = Record<string, any>;
interface Driver {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(sql: string): Promise<void>;
}

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || './data');

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 10 });
    return {
      query: async (sql, params) => ({ rows: (await pool.query(sql, params as any[])).rows }),
      exec: async (sql) => { await pool.query(sql); },
    };
  }
  // Embedded Postgres (PGlite): zero-setup local database stored on disk.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(path.join(DATA_DIR, 'pgdata'));
  await pg.waitReady;
  return {
    query: async (sql, params) => ({ rows: (await pg.query(sql, params as any[])).rows as Row[] }),
    exec: async (sql) => { await pg.exec(sql); },
  };
}

// One driver per process, surviving dev hot reloads.
const g = globalThis as unknown as { __sdDb?: Promise<Driver> };

function ready(): Promise<Driver> {
  if (!g.__sdDb) {
    g.__sdDb = (async () => {
      const d = await createDriver();
      await d.exec(SCHEMA);
      const { seedIfEmpty } = await import('./seed');
      await seedIfEmpty(d);
      return d;
    })();
    g.__sdDb.catch(() => { g.__sdDb = undefined; });
  }
  return g.__sdDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await ready();
  return (await d.query(sql, params)).rows as T[];
}
export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
export const newId = () => randomBytes(9).toString('base64url');
export const j = (v: unknown) => JSON.stringify(v ?? null);
export type { Driver };
