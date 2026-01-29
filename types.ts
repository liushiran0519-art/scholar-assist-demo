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
  methodology: string[];
  takeaways: string[];
}

export interface ContentBlock {
  type: 'paragraph' | 'heading' | 'list';
  en: string;
  cn: string;
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
