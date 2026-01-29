import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PaperSummary, PageTranslation, PaperFile } from '../types';

interface ScholarDB extends DBSchema {
  files: {
    key: string; // fingerprint
    value: {
      fingerprint: string;
      name: string;
      fileData: PaperFile;
      summary: PaperSummary | null;
      fullText?: string;
      createdAt: number;
      lastOpenedAt: number;
    };
    indexes: { 'by-date': number };
  };
  translations: {
    key: string;
    value: {
      id: string;
      fingerprint: string;
      pageNumber: number;
      data: PageTranslation;
      createdAt: number;
    };
    indexes: { 'by-fingerprint': string };
  };
  session: {
    key: string;
    value: {
      id: string;
      fingerprint: string;
      currentPage: number;
    }
  }
}

const DB_NAME = 'ScholarScrollDB';
const DB_VERSION = 4; // ⬆️ 版本升级，确保触发 upgrade 修复索引

let dbPromise: Promise<IDBPDatabase<ScholarDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ScholarDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // --- 1. Files Store (修复索引缺失问题) ---
        let fileStore;
        if (!db.objectStoreNames.contains('files')) {
          fileStore = db.createObjectStore('files', { keyPath: 'fingerprint' });
        } else {
          fileStore = transaction.objectStore('files');
        }
        
        // 关键修复：独立检查索引是否存在
        if (!fileStore.indexNames.contains('by-date')) {
          fileStore.createIndex('by-date', 'lastOpenedAt');
        }

        // --- 2. Translations Store ---
        let transStore;
        if (!db.objectStoreNames.contains('translations')) {
          transStore = db.createObjectStore('translations', { keyPath: 'id' });
        } else {
          transStore = transaction.objectStore('translations');
        }

        if (!transStore.indexNames.contains('by-fingerprint')) {
          transStore.createIndex('by-fingerprint', 'fingerprint');
        }

        // --- 3. Session Store ---
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

// --- History / Bookshelf Operations ---

export const saveFileToHistory = async (fingerprint: string, file: PaperFile, fullText?: string, summary?: PaperSummary) => {
  const db = await getDB();
  // 先获取旧数据，防止覆盖掉已有的 summary 或 fullText
  const existing = await db.get('files', fingerprint);
  
  await db.put('files', {
    fingerprint,
    name: file.name,
    fileData: file,
    // 如果传入了新摘要就用新的，否则沿用旧的，都没有则为 null
    summary: summary !== undefined ? summary : (existing ? existing.summary : null),
    // 如果传入了全文就用新的，否则沿用旧的
    fullText: fullText !== undefined ? fullText : (existing ? existing.fullText : undefined),
    createdAt: existing ? existing.createdAt : Date.now(),
    lastOpenedAt: Date.now() // 更新打开时间，用于排序
  });
};

export const getAllHistory = async () => {
  const db = await getDB();
  try {
    // 尝试使用索引获取（已排序）
    return await db.getAllFromIndex('files', 'by-date');
  } catch (e) {
    console.warn("索引读取失败，降级为普通读取", e);
    // 兜底：如果索引有问题，直接读取所有数据并在内存排序
    const all = await db.getAll('files');
    return all.sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);
  }
};

export const getFileFromHistory = async (fingerprint: string) => {
  const db = await getDB();
  return db.get('files', fingerprint);
};

export const deleteFromHistory = async (fingerprint: string) => {
  const db = await getDB();
  await db.delete('files', fingerprint);
  
  // 级联删除相关的翻译缓存
  const tx = db.transaction('translations', 'readwrite');
  const index = tx.store.index('by-fingerprint');
  let cursor = await index.openCursor(IDBKeyRange.only(fingerprint));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
};

export const updateSummaryInHistory = async (fingerprint: string, summary: PaperSummary) => {
  const db = await getDB();
  const record = await db.get('files', fingerprint);
  if (record) {
    record.summary = summary;
    await db.put('files', record);
  }
};

// --- Translation Operations ---

export const savePageTranslation = async (fingerprint: string, pageNumber: number, data: PageTranslation) => {
  const db = await getDB();
  const id = `${fingerprint}_${pageNumber}`;
  await db.put('translations', { id, fingerprint, pageNumber, data, createdAt: Date.now() });
};

export const getPageTranslation = async (fingerprint: string, pageNumber: number) => {
  const db = await getDB();
  const record = await db.get('translations', `${fingerprint}_${pageNumber}`);
  return record ? record.data : null;
};

export const deletePageTranslation = async (fingerprint: string, pageNumber: number) => {
  const db = await getDB();
  await db.delete('translations', `${fingerprint}_${pageNumber}`);
};

// --- Session Operations ---

export const saveActiveSession = async (fingerprint: string, currentPage: number) => {
  const db = await getDB();
  await db.put('session', { id: 'current_file', fingerprint, currentPage });
};

export const getActiveSession = async () => {
  const db = await getDB();
  return db.get('session', 'current_file');
};

export const clearActiveSession = async () => {
  const db = await getDB();
  await db.delete('session', 'current_file');
};

export const generateFingerprint = async (file: File | Blob, name: string, lastModified: number): Promise<string> => {
  return `${name}_${file.size}_${lastModified}`;
};
