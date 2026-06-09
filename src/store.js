import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'db.json');

const EMPTY_DB = { users: [], groups: [], expenses: [], settlements: [] };

/**
 * A tiny synchronous JSON-file datastore. Good enough for a demo / small app:
 * the whole database is held in memory and flushed to disk on every write.
 */
class Store {
  constructor(file = DATA_FILE) {
    this.file = file;
    this.db = this.#load();
  }

  #load() {
    if (!existsSync(this.file)) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(EMPTY_DB, null, 2));
      return structuredClone(EMPTY_DB);
    }
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return { ...structuredClone(EMPTY_DB), ...parsed };
    } catch {
      return structuredClone(EMPTY_DB);
    }
  }

  #flush() {
    writeFileSync(this.file, JSON.stringify(this.db, null, 2));
  }

  /** Run a mutation against the in-memory db, then persist. */
  mutate(fn) {
    const result = fn(this.db);
    this.#flush();
    return result;
  }

  get(collection) {
    return this.db[collection];
  }
}

export const store = new Store();
export { Store };
