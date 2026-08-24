import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { hashPassword, isHashed } from './password';

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
      permission TEXT NOT NULL DEFAULT 'ADMIN',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      userId INTEGER,
      username TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      ipAddress TEXT
    );
  `);

  // Ensure permission column exists on users table
  try {
    const userTableInfo = wrapperInstance.all('PRAGMA table_info(users);');
    const hasPermissionCol = userTableInfo.some((col: any) => col.name === 'permission');
    if (!hasPermissionCol) {
      wrapperInstance.exec("ALTER TABLE users ADD COLUMN permission TEXT NOT NULL DEFAULT 'ADMIN';");
    }
  } catch (userColErr) {
    console.warn('Users permission column migration check:', userColErr);
  }

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

  // Ensure default admin user exists if table is empty, and ensure all user passwords are securely hashed & salted
  const adminExists = wrapperInstance.get('SELECT id FROM users LIMIT 1');
  if (!adminExists) {
    wrapperInstance.run(
      'INSERT INTO users (id, username, password, name, role, permission, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 'admin', hashPassword('admin'), 'System Administrator', 'admin', 'ADMIN', new Date().toISOString()]
    );
  } else {
    // Check all existing users and hash/salt any legacy plaintext passwords
    try {
      const allUsers = wrapperInstance.all<{ id: number; username: string; password: string; role?: string; permission?: string }>('SELECT id, username, password, role, permission FROM users');
      for (const u of allUsers) {
        if (u.password && !isHashed(u.password)) {
          // If it was plain 'admin' or 'admin123', hash it properly
          const plain = (u.password === 'admin123' && u.username === 'admin') ? 'admin' : u.password;
          wrapperInstance.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(plain), u.id]);
        }
        if (!u.permission || u.permission === 'RW' || u.permission === 'R') {
          const perm = (u.role === 'admin' || u.permission === 'ADMIN') ? 'ADMIN' : 'OPERATOR';
          const role = perm === 'ADMIN' ? 'admin' : 'operator';
          wrapperInstance.run('UPDATE users SET permission = ?, role = ? WHERE id = ?', [perm, role, u.id]);
        }
      }
    } catch (hashErr) {
      console.warn('User password hash migration check:', hashErr);
    }
  }

  // Production readiness: Clear all test data from subscribers, payments, and expenses
  try {
    wrapperInstance.exec('DELETE FROM payments;');
    wrapperInstance.exec('DELETE FROM expenses;');
    wrapperInstance.exec('DELETE FROM subscribers;');
    wrapperInstance.save();
  } catch (purgeErr) {
    console.warn('Production cleanup notice:', purgeErr);
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
      permission TEXT NOT NULL DEFAULT 'ADMIN',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      userId INTEGER,
      username TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      ipAddress TEXT
    );
  `);

  // Ensure permission column exists on users table
  try {
    const userTableInfo = wrapper.all('PRAGMA table_info(users);');
    const hasPermissionCol = userTableInfo.some((col: any) => col.name === 'permission');
    if (!hasPermissionCol) {
      wrapper.exec("ALTER TABLE users ADD COLUMN permission TEXT NOT NULL DEFAULT 'ADMIN';");
    }
  } catch (userColErr) {
    console.warn('Users permission column migration check in restore:', userColErr);
  }

  // Ensure an admin user exists and user passwords are safe
  const adminExists = wrapper.get('SELECT id FROM users LIMIT 1');
  if (!adminExists) {
    wrapper.run(
      'INSERT INTO users (id, username, password, name, role, permission, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 'admin', hashPassword('admin'), 'System Administrator', 'admin', 'ADMIN', new Date().toISOString()]
    );
  } else {
    try {
      const allUsers = wrapper.all<{ id: number; username: string; password: string; role?: string; permission?: string }>('SELECT id, username, password, role, permission FROM users');
      for (const u of allUsers) {
        if (u.password && !isHashed(u.password)) {
          wrapper.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(u.password), u.id]);
        }
        if (!u.permission) {
          const perm = (u.role === 'r' || u.role === 'viewer') ? 'R' : (u.role === 'rw' || u.role === 'editor') ? 'RW' : 'ADMIN';
          wrapper.run('UPDATE users SET permission = ? WHERE id = ?', [perm, u.id]);
        }
      }
    } catch (hashErr) {
      console.warn('ReplaceDatabase password hash migration check:', hashErr);
    }
  }

  wrapper.save();
  return wrapper;
}
