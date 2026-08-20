import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { SEED_FIBER_PROFILES } from './opticalProfilesSeed';

export class SqliteWrapper {
  private db: Database;
  private dbPath: string;

  constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public setDatabase(newDb: Database) {
    this.db = newDb;
  }

  public exportBuffer(): Buffer {
    const data = this.db.export();
    return Buffer.from(data);
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
      macAddress TEXT,
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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fiber_budget_profiles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      txPowerDbm REAL NOT NULL,
      wavelengthNm INTEGER NOT NULL,
      targetRxMinDbm REAL NOT NULL,
      targetRxMaxDbm REAL NOT NULL,
      targetOptimalMinDbm REAL NOT NULL,
      targetOptimalMaxDbm REAL NOT NULL,
      measuredRxDbm REAL,
      itemsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fiber_budget_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Ensure macAddress column exists on subscribers table
  try {
    const tableInfo = wrapperInstance.all('PRAGMA table_info(subscribers);');
    const hasMacCol = tableInfo.some((col: any) => col.name === 'macAddress');
    if (!hasMacCol) {
      wrapperInstance.exec('ALTER TABLE subscribers ADD COLUMN macAddress TEXT;');
    }
  } catch (colErr) {
    console.warn('Subscribers macAddress column migration check:', colErr);
  }

  // Ensure ponPortsJson and activePonPortId columns exist on fiber_budget_profiles
  try {
    const fiberTableInfo = wrapperInstance.all('PRAGMA table_info(fiber_budget_profiles);');
    const hasPonPortsCol = fiberTableInfo.some((col: any) => col.name === 'ponPortsJson');
    if (!hasPonPortsCol) {
      wrapperInstance.exec('ALTER TABLE fiber_budget_profiles ADD COLUMN ponPortsJson TEXT;');
    }
    const hasActivePonCol = fiberTableInfo.some((col: any) => col.name === 'activePonPortId');
    if (!hasActivePonCol) {
      wrapperInstance.exec('ALTER TABLE fiber_budget_profiles ADD COLUMN activePonPortId TEXT;');
    }
  } catch (colErr) {
    console.warn('Fiber profiles ponPortsJson column migration check:', colErr);
  }

  // Ensure default admin user exists if table is empty
  const adminExists = wrapperInstance.get('SELECT id FROM users LIMIT 1');
  if (!adminExists) {
    wrapperInstance.run(
      'INSERT INTO users (id, username, password, name, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'admin', 'admin123', 'System Administrator', 'admin', new Date().toISOString()]
    );
  }

  // Ensure default fiber budget profiles exist if table is empty, and purge test profiles
  try {
    wrapperInstance.exec('DELETE FROM fiber_budget_profiles WHERE id IN ("prof-epon-nested-star-upc", "prof-epon-px20plus-upc", "prof-epon-px20-centralized-upc", "prof-epon-px20pp-unequal-upc", "prof-epon-1-16-direct-upc");');
  } catch (purgeProfErr) {
    console.warn('Fiber profile purge check:', purgeProfErr);
  }

  const fiberProfCount = wrapperInstance.get<{ count: number }>('SELECT count(*) as count FROM fiber_budget_profiles');
  if (!fiberProfCount || fiberProfCount.count === 0) {
    for (const prof of SEED_FIBER_PROFILES) {
      wrapperInstance.run(
        `INSERT INTO fiber_budget_profiles 
        (id, title, description, txPowerDbm, wavelengthNm, targetRxMinDbm, targetRxMaxDbm, targetOptimalMinDbm, targetOptimalMaxDbm, measuredRxDbm, itemsJson, updatedAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prof.id,
          prof.title,
          prof.description || '',
          prof.txPowerDbm,
          prof.wavelengthNm,
          prof.targetRxMinDbm,
          prof.targetRxMaxDbm,
          prof.targetOptimalMinDbm,
          prof.targetOptimalMaxDbm,
          prof.measuredRxDbm !== undefined ? prof.measuredRxDbm : null,
          JSON.stringify(prof.items),
          prof.updatedAt || new Date().toISOString()
        ]
      );
    }
    // Set default active profile
    wrapperInstance.run(
      'INSERT OR REPLACE INTO fiber_budget_settings (key, value) VALUES (?, ?)',
      ['active_profile_id', SEED_FIBER_PROFILES[0].id]
    );
  } else {
    // If active profile was pointing to a removed test profile, point to first available
    const activeSetting = wrapperInstance.get<{ value: string }>('SELECT value FROM fiber_budget_settings WHERE key = "active_profile_id"');
    const activeExists = activeSetting ? wrapperInstance.get('SELECT id FROM fiber_budget_profiles WHERE id = ?', [activeSetting.value]) : null;
    if (!activeExists) {
      const firstProf = wrapperInstance.get<{ id: string }>('SELECT id FROM fiber_budget_profiles LIMIT 1');
      if (firstProf) {
        wrapperInstance.run('INSERT OR REPLACE INTO fiber_budget_settings (key, value) VALUES (?, ?)', ['active_profile_id', firstProf.id]);
      }
    }
  }

  // Clean database initialization: ensure all test subscribers, payments, and expenses are purged
  try {
    wrapperInstance.exec('DELETE FROM payments WHERE referenceNo LIKE "GCASH-%" OR referenceNo LIKE "OR-%" OR referenceNo LIKE "MAYA-%" OR referenceNo LIKE "BDO-%";');
    wrapperInstance.exec('DELETE FROM subscribers WHERE notes LIKE "Fiber Plan %";');
    wrapperInstance.exec('DELETE FROM expenses WHERE note LIKE "%test%" OR note LIKE "%sample%";');
    wrapperInstance.save();
  } catch (purgeErr) {
    console.warn('Initial test data cleanup notice:', purgeErr);
  }

  return wrapperInstance;
}

export async function seedDatabase(wrapper: SqliteWrapper): Promise<void> {
  // Purge all tables for clean system reset
  wrapper.exec('DELETE FROM payments;');
  wrapper.exec('DELETE FROM expenses;');
  wrapper.exec('DELETE FROM subscribers;');
  wrapper.save();
}

export async function replaceDatabase(fileBuffer: Buffer): Promise<SqliteWrapper> {
  const SQL = await initSqlJs();
  const newDb = new SQL.Database(fileBuffer);

  const wrapper = await getDb();
  wrapper.setDatabase(newDb);

  // Ensure necessary schema tables exist
  wrapper.exec(`
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
      macAddress TEXT,
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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fiber_budget_profiles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      txPowerDbm REAL NOT NULL,
      wavelengthNm INTEGER NOT NULL,
      targetRxMinDbm REAL NOT NULL,
      targetRxMaxDbm REAL NOT NULL,
      targetOptimalMinDbm REAL NOT NULL,
      targetOptimalMaxDbm REAL NOT NULL,
      measuredRxDbm REAL,
      itemsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fiber_budget_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Ensure default fiber budget profiles exist if table is empty
  const fiberProfCount = wrapper.get<{ count: number }>('SELECT count(*) as count FROM fiber_budget_profiles');
  if (!fiberProfCount || fiberProfCount.count === 0) {
    for (const prof of SEED_FIBER_PROFILES) {
      wrapper.run(
        `INSERT INTO fiber_budget_profiles 
        (id, title, description, txPowerDbm, wavelengthNm, targetRxMinDbm, targetRxMaxDbm, targetOptimalMinDbm, targetOptimalMaxDbm, measuredRxDbm, itemsJson, updatedAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prof.id,
          prof.title,
          prof.description || '',
          prof.txPowerDbm,
          prof.wavelengthNm,
          prof.targetRxMinDbm,
          prof.targetRxMaxDbm,
          prof.targetOptimalMinDbm,
          prof.targetOptimalMaxDbm,
          prof.measuredRxDbm !== undefined ? prof.measuredRxDbm : null,
          JSON.stringify(prof.items),
          prof.updatedAt || new Date().toISOString()
        ]
      );
    }
    wrapper.run(
      'INSERT OR REPLACE INTO fiber_budget_settings (key, value) VALUES (?, ?)',
      ['active_profile_id', SEED_FIBER_PROFILES[0].id]
    );
  }

  // Ensure an admin user exists
  const adminExists = wrapper.get('SELECT id FROM users LIMIT 1');
  if (!adminExists) {
    wrapper.run(
      'INSERT INTO users (id, username, password, name, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'admin', 'admin123', 'System Administrator', 'admin', new Date().toISOString()]
    );
  }

  wrapper.save();
  return wrapper;
}
