export interface PaperFile {
  name: string;
  url: string;
  base64: string;
  mimeType: string;
}

export interface PaperSummary {
  title: string;
  tags: string[];
  tldr: {
    painPoint: string;
    solution: string;
    effect: string;
  };
  methodology: { step: string; desc: string }[]; // 修正一下这里，确保和 Mock 数据一致
  takeaways: string[];
}

export interface ContentBlock {
  // 新增 title, authors, reference, equation 等类型
  type: 'paragraph' | 'heading' | 'list' | 'equation' | 'figure' | 'title' | 'authors' | 'reference' | 'abstract';
  en: string; // 原文片段（用于定位）
  cn: string; // 译文或解释
}

export interface PageTranslation {
  pageNumber: number;
  blocks: ContentBlock[];
  glossary?: { term: string; definition: string }[];
}

export interface CitationInfo {
  id: string;
  title: string;
  year: string;
  abstract: string;
  status: 'MUST_READ' | 'SKIMMABLE';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
}

export enum AppMode {
  UPLOAD = 'UPLOAD',
  READING = 'READING'
}

export enum SidebarTab {
  SUMMARY = 'SUMMARY',
  CHAT = 'CHAT',
  NOTES = 'NOTES'
}

export interface AppearanceSettings {
  theme: 'sepia' | 'dark';
  fontSize: number;
  fontFamily: 'serif' | 'sans';
}

export interface Note {
  id: string;
  text: string;
  date: string;
}
