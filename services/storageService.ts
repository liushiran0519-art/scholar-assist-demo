const STORAGE_KEY_PREFIX = 'scholar_cat_cache_';

/**
 * 生成简单的文件指纹
 */
export const getFileFingerprint = (file: File): string => {
  return `${file.name}_${file.size}_${file.lastModified}`;
};

/**
 * 尝试从缓存获取摘要
 */
export const getCachedSummary = (fingerprint: string) => {
  const data = localStorage.getItem(STORAGE_KEY_PREFIX + fingerprint);
  if (data) {
    try {
      console.log("💰 命中缓存，省钱了！");
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
};

/**
 * 保存摘要到缓存
 */
export const saveSummaryToCache = (fingerprint: string, summary: any) => {
  try {
    // 简单的清理逻辑：如果存满了，清空所有旧缓存
    // (更高级的做法是用 IndexedDB)
    localStorage.setItem(STORAGE_KEY_PREFIX + fingerprint, JSON.stringify(summary));
  } catch (e) {
    console.warn("缓存已满，清理旧数据...");
    localStorage.clear(); 
    // 清理后再试一次
    try { localStorage.setItem(STORAGE_KEY_PREFIX + fingerprint, JSON.stringify(summary)); } catch(e){}
  }
};
