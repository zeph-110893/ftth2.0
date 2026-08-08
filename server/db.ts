import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

export class SqliteWrapper {
  private db: Database;
  private dbPath: string;

  constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  public save() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  public exec(sql: string) {
    this.db.exec(sql);
    this.save();
  }

  public all<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  public get<T = any>(sql: string, params: any[] = []): T | undefined {
    const rows = this.all<T>(sql, params);
    return rows[0];
  }

  public run(sql: string, params: any[] = []): void {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.run(params);
    } else {
      stmt.run();
    }
    stmt.free();
    this.save();
  }
}

let wrapperInstance: SqliteWrapper | null = null;

export async function getDb(): Promise<SqliteWrapper> {
  if (wrapperInstance) return wrapperInstance;

  const distDbPath = path.join(process.cwd(), 'dist', 'ftth_database.sqlite');
  const rootDbPath = path.join(process.cwd(), 'ftth_database.sqlite');
  const dbPath = process.env.DB_PATH || distDbPath;

  // Ensure target directory exists
  const targetDir = path.dirname(dbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  let db: Database;
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else if (fs.existsSync(rootDbPath)) {
    const filebuffer = fs.readFileSync(rootDbPath);
    db = new SQL.Database(filebuffer);
    fs.writeFileSync(dbPath, filebuffer);
  } else {
    db = new SQL.Database();
  }

  wrapperInstance = new SqliteWrapper(db, dbPath);

  // Create tables
  wrapperInstance.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY,
      last TEXT NOT NULL,
      first TEXT NOT NULL,
      dueRaw TEXT,
      dueDay INTEGER,
      status TEXT NOT NULL,
      vlan INTEGER,
      rate REAL NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      sub INTEGER NOT NULL,
      month TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      referenceNo TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      itemName TEXT NOT NULL,
      unitPrice REAL NOT NULL,
      quantity INTEGER NOT NULL,
      totalPrice REAL NOT NULL,
      date TEXT NOT NULL,
      month TEXT NOT NULL,
      category TEXT,
      note TEXT
    );
  `);

  // Ensure tables exist without inserting test seed data
  return wrapperInstance;
}

export async function seedDatabase(wrapper: SqliteWrapper): Promise<void> {
  // Purge all tables for clean system reset
  wrapper.exec('DELETE FROM payments;');
  wrapper.exec('DELETE FROM expenses;');
  wrapper.exec('DELETE FROM subscribers;');
  wrapper.save();
}
