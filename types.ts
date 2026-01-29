
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
}

export interface PaperSummary {
  title: string;
  tags: string[];
  tldr: {
    painPoint: string; // The Curse
    solution: string;  // The Potion
    effect: string;    // The Buff
  };
  methodology: {
    step: string;
    desc: string;
  }[];
  takeaways: string[]; // Loot
}

export interface PaperFile {
  name: string;
  url: string; // Blob URL for display
  base64: string; // Base64 data for API (full file)
  mimeType: string;
}

export enum AppMode {
  UPLOAD = 'UPLOAD',
  READING = 'READING'
}

export enum SidebarTab {
  SUMMARY = 'SUMMARY',
  CHAT = 'CHAT',
  TRANSLATE = 'TRANSLATE',
  NOTES = 'NOTES'
}

export interface ContentBlock {
  type: 'paragraph' | 'heading' | 'list' | 'equation' | 'figure';
  en: string;
  cn: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface PageTranslation {
  pageNumber: number;
  blocks: ContentBlock[];
  glossary: GlossaryTerm[];
}

export interface CitationInfo {
  id: string;
  title: string;
  year: string;
  abstract: string;
  status: 'MUST_READ' | 'NORMAL' | 'IGNORE';
}

export interface AppearanceSettings {
  theme: 'dark' | 'sepia';
  fontSize: number; // 12 - 24
  fontFamily: 'serif' | 'sans';
}

export interface Note {
  id: string;
  text: string;
  date: string;
}
