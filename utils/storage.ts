import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PaperSummary, PageTranslation, PaperFile } from '../types';

interface ScholarDB extends DBSchema {
  // 1. 文件元数据与内容存储 (书架核心)
  files: {
    key: string; // fingerprint
    value: {
      fingerprint: string;
      name: string; // 文件名
      fileData: PaperFile; // 存储完整的 PDF 数据 (Base64)
      summary: PaperSummary | null; // 摘要可能还没生成
      fullText?: string; // 提取的纯文本
      createdAt: number;
      lastOpenedAt: number; // 用于排序最近阅读
    };
    indexes: { 'by-date': number };
  };
  // 2. 翻译缓存
  translations: {
    key: string; // fingerprint_pageNum
    value: {
      id: string;
      fingerprint: string;
      pageNumber: number;
      data: PageTranslation;
      createdAt: number;
    };
    indexes: { 'by-fingerprint': string };
  };
  // 3. 当前会话 (用于刷新页面恢复)
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
const DB_VERSION = 3; // ⬆️ 版本号升级

let dbPromise: Promise<IDBPDatabase<ScholarDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ScholarDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        // 创建文件存储
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'fingerprint' });
          store.createIndex('by-date', 'lastOpenedAt');
        }
        // 创建翻译存储
        if (!db.objectStoreNames.contains('translations')) {
          const store = db.createObjectStore('translations', { keyPath: 'id' });
          store.createIndex('by-fingerprint', 'fingerprint');
        }
        // 创建会话存储
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

// --- History / Bookshelf Operations (报错就是因为缺了这一块) ---

// 1. 保存或更新文件到历史记录
export const saveFileToHistory = async (fingerprint: string, file: PaperFile, fullText?: string, summary?: PaperSummary) => {
  const db = await getDB();
  const existing = await db.get('files', fingerprint);
  
  await db.put('files', {
    fingerprint,
    name: file.name,
    fileData: file,
    summary: summary || (existing ? existing.summary : null), 
    fullText: fullText || (existing ? existing.fullText : undefined),
    createdAt: existing ? existing.createdAt : Date.now(),
    lastOpenedAt: Date.now()
  });
};

// 2. 获取所有历史记录（用于书架列表） -> ✅ App.tsx 需要这个
export const getAllHistory = async () => {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-date');
};

// 3. 获取单个文件详情（用于打开）
export const getFileFromHistory = async (fingerprint: string) => {
  const db = await getDB();
  return db.get('files', fingerprint);
};

// 4. 删除历史记录
export const deleteFromHistory = async (fingerprint: string) => {
  const db = await getDB();
  await db.delete('files', fingerprint);
  // 同时清理相关的翻译缓存，释放空间
  const tx = db.transaction('translations', 'readwrite');
  const index = tx.store.index('by-fingerprint');
  let cursor = await index.openCursor(IDBKeyRange.only(fingerprint));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
};

// 5. 单独更新摘要（修复重试功能） -> ✅ App.tsx 需要这个
export const updateSummaryInHistory = async (fingerprint: string, summary: PaperSummary) => {
  const db = await getDB();
  const record = await db.get('files', fingerprint);
  if (record) {
    record.summary = summary;
    await db.put('files', record);
  }
};

// --- Translation Operations (Unchanged) ---
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

// --- Session Operations (Unchanged) ---
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
