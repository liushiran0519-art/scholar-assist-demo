import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PaperSummary, PageTranslation, PaperFile } from '../types';

interface ScholarDB extends DBSchema {
  files: {
    key: string; // fingerprint
    value: {
      fingerprint: string;
      name: string;
      summary: PaperSummary;
      fullText?: string;
      createdAt: number;
    };
  };
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
  // [新增] 存储当前活跃的文件，实现刷新恢复
  session: {
    key: string; // 固定 'current_file'
    value: {
      id: string;
      file: PaperFile;
      fingerprint: string;
      currentPage: number;
    }
  }
}

const DB_NAME = 'ScholarScrollDB';
const DB_VERSION = 2; // 升级版本号

let dbPromise: Promise<IDBPDatabase<ScholarDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ScholarDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'fingerprint' });
        }
        if (!db.objectStoreNames.contains('translations')) {
          const store = db.createObjectStore('translations', { keyPath: 'id' });
          store.createIndex('by-fingerprint', 'fingerprint');
        }
        // [新增] Session Store
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const generateFingerprint = async (file: File | Blob, name: string, lastModified: number): Promise<string> => {
  return `${name}_${file.size}_${lastModified}`;
};

// --- Summary Operations ---

export const saveSummary = async (fingerprint: string, name: string, summary: PaperSummary, fullText?: string) => {
  const db = await getDB();
  await db.put('files', {
    fingerprint,
    name,
    summary,
    fullText,
    createdAt: Date.now()
  });
};

export const getSummary = async (fingerprint: string) => {
  const db = await getDB();
  return db.get('files', fingerprint);
};

// --- Translation Operations ---

export const savePageTranslation = async (fingerprint: string, pageNumber: number, data: PageTranslation) => {
  const db = await getDB();
  const id = `${fingerprint}_${pageNumber}`;
  await db.put('translations', {
    id,
    fingerprint,
    pageNumber,
    data,
    createdAt: Date.now()
  });
};

export const getPageTranslation = async (fingerprint: string, pageNumber: number) => {
  const db = await getDB();
  const id = `${fingerprint}_${pageNumber}`;
  const record = await db.get('translations', id);
  return record ? record.data : null;
};

// --- Session Operations (Persistence) ---

export const saveActiveSession = async (file: PaperFile, fingerprint: string, currentPage: number) => {
  const db = await getDB();
  await db.put('session', {
    id: 'current_file',
    file,
    fingerprint,
    currentPage
  });
};

export const getActiveSession = async () => {
  const db = await getDB();
  return db.get('session', 'current_file');
};

export const clearActiveSession = async () => {
  const db = await getDB();
  await db.delete('session', 'current_file');
};
