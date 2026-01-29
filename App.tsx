import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { PaperFile, PaperSummary, SidebarTab, ChatMessage, AppMode, PageTranslation, ContentBlock, CitationInfo, AppearanceSettings, Note } from './types';
import { extractTextFromPdf, extractPageText, fileToBase64 } from './utils/pdfUtils';
import { generateFingerprint, getSummary, saveSummary, getPageTranslation, savePageTranslation, saveActiveSession, getActiveSession, clearActiveSession } from './utils/storage';
import { generatePaperSummary, chatWithPaper, translatePageContent, analyzeCitation, explainEquation } from './services/geminiService';
import { chatWithDeepSeek } from './services/deepseekService';
import SummaryView from './components/SummaryView';
import ChatInterface from './components/ChatInterface';
import Translator from './components/Translator';
import PDFViewer from './components/PDFViewer';
import TranslationViewer from './components/TranslationViewer';
import { UploadIcon, BookOpenIcon, XIcon, SettingsIcon, GripVerticalIcon, StarIcon } from './components/IconComponents';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [file, setFile] = useState<PaperFile | null>(null);
  const [fileFingerprint, setFileFingerprint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | 'DUAL'>('DUAL');
  const [aiModel, setAiModel] = useState<'gemini' | 'deepseek'>('gemini');
  
  // PDF State
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedPage, setDebouncedPage] = useState(1);
  const [highlightText, setHighlightText] = useState<string | null>(null);

  // Layout State
  const [leftWidth, setLeftWidth] = useState(50);
  const isResizing = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>({
    theme: 'sepia',
    fontSize: 16,
    fontFamily: 'serif'
  });

  const [notes, setNotes] = useState<Note[]>([]);
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [fullText, setFullText] = useState<string>(""); // 用于 Chat 上下文
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  // Translation State
  const [pageTranslations, setPageTranslations] = useState<Map<number, PageTranslation>>(new Map());
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);

  // Overlays
  const [citationInfo, setCitationInfo] = useState<CitationInfo | null>(null);
  const [equationExplanation, setEquationExplanation] = useState<string | null>(null);
  const [isAnalyzingCitation, setIsAnalyzingCitation] = useState(false);
  const [isAnalyzingEquation, setIsAnalyzingEquation] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- 1. Session Restoration (App Mount) ---
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const session = await getActiveSession();
        if (session && session.file) {
          console.log("[Session] Found previous session:", session.file.name);
          setFile(session.file);
          setFileFingerprint(session.fingerprint);
          setCurrentPage(session.currentPage || 1);
          setDebouncedPage(session.currentPage || 1);
          setMode(AppMode.READING);
          
          // Restore Summary silently
          const cachedData = await getSummary(session.fingerprint);
          if (cachedData) {
            setSummary(cachedData.summary);
            setFullText(cachedData.fullText || "");
          }
        }
      } catch (e) {
        console.error("Session restore failed", e);
      }
    };
    restoreSession();
  }, []);

  // --- 2. Save Session on Change ---
  useEffect(() => {
    if (file && fileFingerprint) {
      // 这里的防抖是为了不频繁写入 IndexedDB
      const handler = setTimeout(() => {
        saveActiveSession(file, fileFingerprint, debouncedPage);
      }, 1000);
      return () => clearTimeout(handler);
    }
  }, [file, fileFingerprint, debouncedPage]);


  // --- 3. Debounce Page Change ---
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedPage(currentPage);
    }, 500); // 500ms debounce
    return () => clearTimeout(handler);
  }, [currentPage]);


  // --- 4. Main Translation Logic (Text-Based & Cached) ---
  // 核心改动：完全依赖 useEffect 监听页码变化，而非等待 Canvas 渲染
  useEffect(() => {
    const loadTranslation = async () => {
      if (mode !== AppMode.READING || !file || !fileFingerprint) return;
      
      const pageNum = debouncedPage;

      // A. Check Memory State first
      if (pageTranslations.has(pageNum)) return;

      setIsTranslatingPage(true);

      try {
        // B. Check IndexedDB Cache
        const cachedTrans = await getPageTranslation(fileFingerprint, pageNum);
        
        if (cachedTrans) {
          console.log(`[Cache] 📖 Page ${pageNum} Hit (DB)`);
          setPageTranslations(prev => new Map(prev).set(pageNum, cachedTrans));
        } else {
          // C. API Call (Text Extraction -> AI)
          console.log(`[API] ⚡ Extracting text & Translating Page ${pageNum}...`);
          
          // 1. Extract Text locally (No Image sending!)
          const pageText = await extractPageText(file.base64, pageNum);
          
          // 2. Call AI with Text
          const newTrans = await translatePageContent(pageText);
          newTrans.pageNumber = pageNum;

          // 3. Save to Cache
          await savePageTranslation(fileFingerprint, pageNum, newTrans);
          
          // 4. Update State
          setPageTranslations(prev => new Map(prev).set(pageNum, newTrans));
        }
      } catch (error) {
        console.error("Translation Error:", error);
      } finally {
        setIsTranslatingPage(false);
      }
    };

    loadTranslation();
  }, [debouncedPage, fileFingerprint, mode, file]); // removed pageTranslations dependency to avoid loops


  // --- File Upload ---
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      
      // 1. Basic Setup
      const base64Data = await fileToBase64(selectedFile);
      // 使用更稳定的 fingerprint (name + size + lastModified)
      const fingerprint = await generateFingerprint(selectedFile, selectedFile.name, selectedFile.lastModified);
      
      setFileFingerprint(fingerprint);

      const newFile: PaperFile = {
        name: selectedFile.name,
        url: URL.createObjectURL(selectedFile),
        base64: base64Data,
        mimeType: selectedFile.type
      };

      setFile(newFile);
      setMode(AppMode.READING);
      setCurrentPage(1);
      setDebouncedPage(1);
      
      // 2. Check Cache for Summary
      try {
        setIsSummarizing(true);
        const cachedData = await getSummary(fingerprint);
        
        if (cachedData) {
          console.log(`[Cache] 🎯 Summary hit for ${fingerprint}`);
          setSummary(cachedData.summary);
          setFullText(cachedData.fullText || "");
          setIsSummarizing(false);
        } else {
          console.log("[Cache] 💨 Miss. Generating summary...");
          // Extract Text (Local CPU)
          const textContent = await extractTextFromPdf(base64Data);
          setFullText(textContent);
          
          // Generate Summary (API - Text Only)
          const newSummary = await generatePaperSummary(textContent);
          
          // Save
          await saveSummary(fingerprint, selectedFile.name, newSummary, textContent);
          
          setSummary(newSummary);
          setIsSummarizing(false);
        }
      } catch (error) {
        console.error("Processing failed:", error);
        setSummary({
          title: "解析失败",
          tags: ["ERROR"],
          tldr: { painPoint: "无法读取文件", solution: "请重试或检查文件", effect: "无" },
          methodology: [],
          takeaways: []
        });
        setIsSummarizing(false);
      }
    }
  };

  // --- Interaction Handlers ---
  const handleCitationClick = (id: string) => { showToast(`引用跳转暂未实装: ${id}`); };
  const handleEquationClick = (eq: string) => { showToast("公式: " + eq); }; // Demo behavior

  const handleContextSelection = (text: string, action: 'explain' | 'save') => {
    if (action === 'explain') {
      setActiveTab(SidebarTab.CHAT);
      handleSendMessage(`请通俗解释这段话：\n"${text}"`);
    } else if (action === 'save') {
      const newNote: Note = {
        id: Date.now().toString(),
        text: text,
        date: new Date().toLocaleString()
      };
      setNotes(prev => [newNote, ...prev]);
      setActiveTab(SidebarTab.NOTES);
      showToast("已收藏至魔法笔记！");
    }
  };

  const handleSendMessage = async (text: string) => {
    const newUserMsg: ChatMessage = { role: 'user', text };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatting(true);
    
    try {
      let answer = '';
      if (aiModel === 'deepseek') {
        const response = await chatWithDeepSeek(text);
        answer = response || "DeepSeek 没有返回内容";
      } else {
        // Pass text context (Summary or current page text) instead of image
        const context = fullText || "No context available."; 
        const historyForApi = chatMessages.map(m => ({ role: m.role, text: m.text }));
        answer = await chatWithPaper(historyForApi, text, context);
      }
      setChatMessages(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "网络请求失败，请检查 API Key。", isError: true }]);
    } finally {
      setIsChatting(false);
    }
  };

  const resetApp = async () => {
    await clearActiveSession(); // Clear session from DB
    setFile(null);
    setFileFingerprint(null);
    setMode(AppMode.UPLOAD);
    setSummary(null);
    setChatMessages([]);
    setPageTranslations(new Map());
    setCurrentPage(1);
    setDebouncedPage(1);
  };
  
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  // Resizing logic (omitted for brevity, same as before)
  const startResizing = useCallback(() => { isResizing.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, []);
  const stopResizing = useCallback(() => { isResizing.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }, []);
  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setLeftWidth(newWidth);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); };
  }, [resize, stopResizing]);

  if (mode === AppMode.UPLOAD) {
    // ... UPLOAD UI (Keep exact same as before)
    return (
       <div className="min-h-screen bg-[#2c1810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Simplified Background for brevity */}
        <div className="max-w-xl w-full text-center space-y-8 animate-in fade-in duration-700 relative z-10">
          <div>
             <div className="bg-[#8B4513] w-20 h-20 mx-auto flex items-center justify-center mb-6 rpg-border shadow-[4px_4px_0_0_#1a0f0a]">
              <BookOpenIcon className="text-[#DAA520] w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold text-[#e8e4d9] mb-3 pixel-font">Scholar Scroll</h1>
            <p className="text-lg text-[#DAA520] serif italic">研读卷轴 · 解锁古老知识的秘密</p>
          </div>

          <div className="bg-[#e8e4d9] p-10 rpg-border hover:brightness-110 transition-all cursor-pointer group relative shadow-[8px_8px_0_0_#1a0f0a]">
            <input type="file" accept=".pdf" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="space-y-4">
              <div className="w-16 h-16 bg-[#2c1810] rounded-full flex items-center justify-center mx-auto border-2 border-[#DAA520]">
                <UploadIcon className="w-8 h-8 text-[#DAA520]" />
              </div>
              <p className="font-bold text-lg text-[#2c1810] pixel-font">召唤 PDF 卷轴</p>
            </div>
          </div>
          <div className="text-[#8B4513] text-xs serif italic">* 自动缓存：刷新页面不会丢失进度</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans ${appearance.theme === 'sepia' ? 'bg-[#F4ECD8]' : 'bg-[#2c1810]'}`}>
      
      {/* Header */}
      <div className={`h-16 border-b-4 flex items-center px-4 justify-between shrink-0 shadow-lg z-50 ${appearance.theme === 'sepia' ? 'bg-[#e8e4d9] border-[#8B4513]' : 'bg-[#2c1810] border-[#8B4513]'}`}>
         <div className="flex items-center gap-3">
           <div className="bg-[#DAA520] p-1 border-2 border-[#e8e4d9]">
             <BookOpenIcon className="w-6 h-6 text-[#2c1810]" />
           </div>
           <span className="font-bold pixel-font text-xs tracking-widest hidden md:block text-[#8B4513]">SCHOLAR SCROLL</span>
           <span className="h-6 w-1 bg-[#8B4513] mx-2"></span>
           <span className="text-xs font-bold text-[#DAA520] truncate max-w-[200px] pixel-font">{file?.name}</span>
         </div>
         {/* ... (Keep existing Header buttons: Settings, Tabs, Close) */}
         <div className="flex gap-2 items-center">
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 border-2 border-[#DAA520] text-[#DAA520]"><SettingsIcon className="w-5 h-5"/></button>
            {/* Settings Dropdown omitted for brevity, stick to original logic */}
            <button onClick={resetApp} className="text-[#e8e4d9] hover:text-red-400 p-2"><XIcon className="w-6 h-6" /></button>
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT: PDF Viewer */}
        <div className="h-full relative bg-[#5c4033]" style={{ width: `${leftWidth}%` }}>
          {file && (
             <PDFViewer 
               ref={pdfContainerRef}
               fileUrl={file.url}
               pageNumber={currentPage}
               onPageChange={setCurrentPage}
               onPageRendered={() => {}} // Removed dependency on render for API
               highlightText={highlightText}
               onTextSelected={handleContextSelection}
             />
          )}
        </div>

        {/* Resizer */}
        <div 
           className="w-2 bg-[#2c1810] border-l border-r border-[#8B4513] cursor-col-resize hover:bg-[#DAA520] z-40"
           onMouseDown={startResizing}
        >
          <GripVerticalIcon className="w-4 h-4 text-[#8B4513] mt-[50vh]" />
        </div>

        {/* RIGHT: AI Panels */}
        <div className="h-full relative" style={{ width: `${100 - leftWidth}%`, backgroundColor: appearance.theme === 'sepia' ? '#F4ECD8' : '#2c1810' }}>
          
          {activeTab === 'DUAL' && (
             <TranslationViewer 
               translation={pageTranslations.get(debouncedPage)}
               isLoading={isTranslatingPage}
               onHoverBlock={setHighlightText}
               onRetry={() => {
                   // Manual Retry: Remove from cache and state to trigger useEffect
                   setPageTranslations(prev => {
                       const newMap = new Map(prev);
                       newMap.delete(debouncedPage);
                       return newMap;
                   });
               }}
               onCitationClick={handleCitationClick}
               onEquationClick={handleEquationClick}
               appearance={appearance}
             />
          )}

          {activeTab === SidebarTab.SUMMARY && (
             <div className="p-0 h-full overflow-y-auto bg-[#f4ecd8]">
               <SummaryView summary={summary} isLoading={isSummarizing} error={null} />
             </div>
          )}
          
          {activeTab === SidebarTab.CHAT && (
             <ChatInterface messages={chatMessages} onSendMessage={handleSendMessage} isSending={isChatting} />
          )}

          {activeTab === SidebarTab.NOTES && (
            <div className="p-6 h-full overflow-y-auto bg-[#e8e4d9] space-y-4">
              <h3 className="font-bold pixel-font text-[#2c1810]">魔法笔记 (Saved Notes)</h3>
              {notes.map(note => (
                 <div key={note.id} className="bg-[#fffef0] p-3 border-2 border-[#8B4513] rounded">
                    <p className="text-[#2c1810] serif text-sm">{note.text}</p>
                 </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Toast */}
        {toastMessage && (
          <div className="absolute bottom-8 right-8 z-50 animate-bounce bg-[#2c1810] text-[#DAA520] p-3 rounded-lg border-2 border-[#DAA520]">
             {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
