import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperFile, PaperSummary, SidebarTab, ChatMessage, AppMode, PageTranslation, CitationInfo, AppearanceSettings, Note } from './types';
import { extractTextFromPdf, extractPageText, fileToBase64, base64ToBlobUrl } from './utils/pdfUtils';
import { generateFingerprint, saveFileToHistory, getAllHistory, getFileFromHistory, deleteFromHistory, updateSummaryInHistory, getPageTranslation, savePageTranslation, deletePageTranslation, saveActiveSession, getActiveSession, clearActiveSession } from './utils/storage';
import { generatePaperSummary, chatWithPaper, translatePageContent, analyzeCitation, explainEquation, extractGlossary, chatWithPaperStream } from './services/geminiService';
import { chatWithDeepSeek } from './services/deepseekService';
import { ragSystem } from './services/ragService'; // 引入 RAG
import SummaryView from './components/SummaryView';
import ChatInterface from './components/ChatInterface';
import TranslationViewer from './components/TranslationViewer';
import PDFViewer from './components/PDFViewer';
import { PDFOutline } from './components/PDFOutline'; // 引入目录组件
import { ScholarCatMascot, CatMood } from './components/ScholarCatMascot';
import { CursorSystem } from './components/CursorSystem'; 
import { UploadIcon, BookOpenIcon, XIcon, SettingsIcon, GripVerticalIcon } from './components/IconComponents';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [file, setFile] = useState<PaperFile | null>(null);
  const [fileFingerprint, setFileFingerprint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | 'DUAL'>('DUAL');
  
  const [aiModel, setAiModel] = useState<'gemini' | 'deepseek'>('gemini');
  const [historyList, setHistoryList] = useState<any[]>([]);

  // PDF State
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedPage, setDebouncedPage] = useState(1);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  const [pdfSelectedText, setPdfSelectedText] = useState<string | null>(null);
  
  // PDF Navigation State (新功能)
  const [pdfDocument, setPdfDocument] = useState<any>(null); // 保存 PDF 对象
  const [showOutline, setShowOutline] = useState(true); // 控制目录显示
  const [numPages, setNumPages] = useState(0);

  // Layout State
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('scholar_layout_width');
    return saved ? parseFloat(saved) : 50;
  });
  const isResizing = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    const saved = localStorage.getItem('scholar_appearance');
    return saved ? JSON.parse(saved) : {
      theme: 'sepia',
      fontSize: 16,
      fontFamily: 'serif'
    };
  });

  const [notes, setNotes] = useState<Note[]>([]);
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [fullText, setFullText] = useState<string>(""); 
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  const [pageTranslations, setPageTranslations] = useState<Map<number, PageTranslation>>(new Map());
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);
  const [glossary, setGlossary] = useState<{term: string, definition: string}[]>([]); // 术语表

  const [citationInfo, setCitationInfo] = useState<CitationInfo | null>(null);
  const [equationExplanation, setEquationExplanation] = useState<string | null>(null);
  const [isAnalyzingCitation, setIsAnalyzingCitation] = useState(false);
  const [isAnalyzingEquation, setIsAnalyzingEquation] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [catMood, setCatMood] = useState<CatMood>('IDLE');
  const [catMessage, setCatMessage] = useState<string | null>(null);

  // --- 0. Load History on Mount ---
  useEffect(() => {
    loadHistoryList();
  }, []);

  const loadHistoryList = async () => {
    const list = await getAllHistory();
    setHistoryList(list.reverse());
  };

  // --- 1. Session Restoration ---
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const session = await getActiveSession();
        if (session) {
          console.log("[Session] Found previous session:", session.fingerprint);
          await openFromHistory(session.fingerprint, session.currentPage);
        }
      } catch (e) {
        console.error("Session restore failed", e);
        await clearActiveSession();
      }
    };
    if (!file) {
      restoreSession();
    }
  }, []);

  // --- 2. Save Session ---
  useEffect(() => {
    if (file && fileFingerprint) {
      const handler = setTimeout(() => {
        saveActiveSession(fileFingerprint, debouncedPage);
      }, 1000);
      return () => clearTimeout(handler);
    }
  }, [file, fileFingerprint, debouncedPage]);

  // --- 3. Cat Mood Logic ---
  useEffect(() => {
    if (isChatting) {
      setCatMood('THINKING');
      setCatMessage("正在思考你的问题... (Thinking...)");
    } else if (isTranslatingPage || isSummarizing || isAnalyzingCitation || isAnalyzingEquation) {
      setCatMood('SEARCHING');
      setCatMessage("正在解读古卷... (Deciphering...)");
    } else if (fullText && !summary) {
        setCatMood('SUCCESS');
        setCatMessage("卷轴读取完毕！(Ready!)");
        setTimeout(() => setCatMessage(null), 3000);
    } else {
      setCatMood('IDLE');
      const timer = setTimeout(() => setCatMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [isChatting, isTranslatingPage, isSummarizing, isAnalyzingCitation, isAnalyzingEquation, fullText, summary]);

  // --- 4. Debounce Page Change ---
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedPage(currentPage);
    }, 500); 
    return () => clearTimeout(handler);
  }, [currentPage]);

  // --- 5. Main Translation Logic & Glossary Injection ---
  useEffect(() => {
    const loadTranslation = async () => {
      if (mode !== AppMode.READING || !file || !fileFingerprint) return;
      
      const pageNum = debouncedPage;
      if (pageTranslations.has(pageNum)) return;

      setIsTranslatingPage(true);

      try {
        const cachedTrans = await getPageTranslation(fileFingerprint, pageNum);
        
        // 简单校验缓存是否损坏
        const isInvalidCache = cachedTrans && 
          cachedTrans.blocks.length === 1 && 
          (cachedTrans.blocks[0].en === "Error" || cachedTrans.blocks[0].cn.includes("AI 格式错误"));

        if (cachedTrans && !isInvalidCache) {
          console.log(`[Cache] 📖 Page ${pageNum} Hit`);
          // 如果有最新的 glossary，注入到旧缓存中
          if (glossary.length > 0 && (!cachedTrans.glossary || cachedTrans.glossary.length === 0)) {
             cachedTrans.glossary = glossary;
          }
          setPageTranslations(prev => new Map(prev).set(pageNum, cachedTrans));
        } else {
          if (isInvalidCache) await deletePageTranslation(fileFingerprint, pageNum);

          console.log(`[API] ⚡ Translating Page ${pageNum}...`);
          const pageText = await extractPageText(file.base64, pageNum);
          
          const newTrans = await translatePageContent(pageText);
          newTrans.pageNumber = pageNum;
          // 注入全局 glossary
          newTrans.glossary = [...(newTrans.glossary || []), ...glossary];

          const isSuccess = newTrans.blocks.length > 0 && newTrans.blocks[0].en !== "Error";

          if (isSuccess) {
            await savePageTranslation(fileFingerprint, pageNum, newTrans);
          }
          
          setPageTranslations(prev => new Map(prev).set(pageNum, newTrans));
        }
      } catch (error) {
        console.error("Translation Error:", error);
      } finally {
        setIsTranslatingPage(false);
      }
    };

    loadTranslation();
  }, [debouncedPage, fileFingerprint, mode, file, glossary]); 

  // --- 6. RAG & Glossary Initialization ---
  useEffect(() => {
    const initAIContext = async () => {
      if (!fullText || mode !== AppMode.READING) return;

      // 1. 初始化 RAG
      if (fullText.length > 100) {
         console.log("[AI] Initializing RAG Knowledge Base...");
         ragSystem.ingest(fullText);
      }

      // 2. 提取术语表 (仅当第一次加载且没有术语时)
      if (glossary.length === 0 && fullText.length > 500) {
        console.log("[AI] Extracting Glossary...");
        // 假设第一页包含关键信息
        const firstPageText = fullText.slice(0, 4000); 
        try {
           const terms = await extractGlossary(firstPageText);
           setGlossary(terms);
           if (terms.length > 0) showToast(`已提取 ${terms.length} 个核心术语`);
        } catch (e) {
           console.error("Glossary extract failed", e);
        }
      }
    };
    
    initAIContext();
  }, [fullText, mode]);

  // ... (Keep existing Persistence Effects and Hotkeys)
  useEffect(() => { localStorage.setItem('scholar_layout_width', leftWidth.toString()); }, [leftWidth]);
  useEffect(() => { localStorage.setItem('scholar_appearance', JSON.stringify(appearance)); }, [appearance]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key) {
        case 'ArrowLeft': if (mode === AppMode.READING && currentPage > 1) setCurrentPage(p => p - 1); break;
        case 'ArrowRight': if (mode === AppMode.READING) setCurrentPage(p => p + 1); break;
        case 'Escape': 
          if (citationInfo) setCitationInfo(null);
          if (equationExplanation) setEquationExplanation(null);
          if (showSettings) setShowSettings(false);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, currentPage, citationInfo, equationExplanation, showSettings]);


  // --- File Handling ---
  const processUploadedFile = async (selectedFile: File) => {
    const base64Data = await fileToBase64(selectedFile);
    const fingerprint = await generateFingerprint(selectedFile, selectedFile.name, selectedFile.lastModified);
    
    const newFile: PaperFile = {
      name: selectedFile.name,
      url: URL.createObjectURL(selectedFile),
      base64: base64Data,
      mimeType: selectedFile.type
    };

    setFile(newFile);
    setFileFingerprint(fingerprint);
    setMode(AppMode.READING);
    setCurrentPage(1);
    setDebouncedPage(1);
    setPageTranslations(new Map());
    setSummary(null); 
    setGlossary([]); 
    setPdfDocument(null);
    
    try {
      setIsSummarizing(true);
      await saveFileToHistory(fingerprint, newFile);

      const existingRecord = await getFileFromHistory(fingerprint);
      
      if (existingRecord && existingRecord.summary && !existingRecord.summary.tags.includes("ERROR")) {
        setSummary(existingRecord.summary);
        setFullText(existingRecord.fullText || "");
        setIsSummarizing(false);
      } else {
        const textContent = await extractTextFromPdf(base64Data);
        setFullText(textContent);
        
        await saveFileToHistory(fingerprint, newFile, textContent);
        const newSummary = await generatePaperSummary(textContent);
        await saveFileToHistory(fingerprint, newFile, textContent, newSummary);
        
        setSummary(newSummary);
        setIsSummarizing(false);
      }
    } catch (error) {
      console.error("Processing failed:", error);
      setSummary({ title: "解析失败", tags: ["ERROR"], tldr: { painPoint: "读取失败", solution: "请重试", effect: "无" }, methodology: [], takeaways: [] });
      setIsSummarizing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) await processUploadedFile(event.target.files[0]);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type !== 'application/pdf') { showToast("请投喂 PDF 卷轴喵！"); return; }
      await processUploadedFile(file);
    }
  }, []);

  // --- History Handling ---
  const openFromHistory = async (fingerprint: string, savedPage: number = 1) => {
    try {
      const record = await getFileFromHistory(fingerprint);
      if (!record) { showToast("文件已丢失"); return; }

      const validUrl = base64ToBlobUrl(record.fileData.base64, record.fileData.mimeType);
      const restoredFile = { ...record.fileData, url: validUrl };

      setFile(restoredFile);
      setFileFingerprint(record.fingerprint);
      setSummary(record.summary);
      setFullText(record.fullText || "");
      setCurrentPage(savedPage);
      setDebouncedPage(savedPage);
      setMode(AppMode.READING);
      setPageTranslations(new Map());
      setGlossary([]); 
      setPdfDocument(null);
      
      await saveFileToHistory(fingerprint, restoredFile, record.fullText, record.summary);
    } catch (e) {
      console.error("Open history failed", e);
      showToast("文件打开失败");
      await clearActiveSession();
    }
  };

  const handleDeleteHistory = async (e: React.MouseEvent, fingerprint: string) => {
    e.stopPropagation();
    if (confirm("确定要删除这本卷轴吗？")) {
      await deleteFromHistory(fingerprint);
      loadHistoryList(); 
    }
  };
  
  // --- Interactions ---
  const retrySummary = async () => {
    if (!file) return;
    setIsSummarizing(true);
    setSummary(null); 
    try {
      let text = await extractTextFromPdf(file.base64);
      const newSummary = await generatePaperSummary(text);
      setSummary(newSummary);
      if (fileFingerprint) await updateSummaryInHistory(fileFingerprint, newSummary);
    } catch (e) {
      setSummary({ title: "重试失败", tags: ["ERROR"], tldr: { painPoint: "依然无法解析", solution: "可能是文件已加密", effect: "无" }, methodology: [], takeaways: [] });
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const handleCitationClick = async (id: string) => { 
    if (!fullText) return;
    setIsAnalyzingCitation(true);
    setCitationInfo(null);
    try {
      const info = await analyzeCitation(id, fullText);
      setCitationInfo(info);
    } catch(e) { console.error(e); } 
    finally { setIsAnalyzingCitation(false); }
  };

  const handleEquationClick = async (eq: string) => { 
    setIsAnalyzingEquation(true);
    setEquationExplanation(null);
    try {
      const res = await explainEquation(eq);
      setEquationExplanation(res);
    } catch(e) { console.error(e); }
    finally { setIsAnalyzingEquation(false); }
  };

  const handleContextSelection = (text: string, action: 'explain' | 'save') => {
    if (action === 'explain') {
      setActiveTab(SidebarTab.CHAT);
      handleSendMessage(`请通俗解释这段话：\n"${text}"`);
    } else if (action === 'save') {
      const newNote: Note = { id: Date.now().toString(), text: text, date: new Date().toLocaleString() };
      setNotes(prev => [newNote, ...prev]);
      setActiveTab(SidebarTab.NOTES);
      showToast("已收藏至魔法笔记！");
    }
  };

  // ✅ 更新：Chat 发送逻辑 (支持流式 & RAG)
  const handleSendMessage = async (text: string) => {
    const newUserMsg: ChatMessage = { role: 'user', text };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatting(true);

    try {
      // 1. RAG 检索
      const ragContext = ragSystem.retrieve(text, 3);
      console.log("[RAG] Context:", ragContext.substring(0, 100) + "...");

      if (aiModel === 'deepseek') {
        // DeepSeek 暂不走流式，保持原样
        const answer = await chatWithDeepSeek(text + `\n\nContext:\n${ragContext}`);
        setChatMessages(prev => [...prev, { role: 'model', text: answer || "Error" }]);
      } else {
        // Gemini 走流式
        const botMsgId = Date.now();
        setChatMessages(prev => [...prev, { role: 'model', text: '', id: botMsgId }]); 

        let fullAnswer = "";
        const stream = chatWithPaperStream(
          chatMessages.map(m => ({ role: m.role, text: m.text })), 
          text, 
          ragContext || fullText.slice(0, 5000)
        );

        for await (const chunk of stream) {
          fullAnswer += chunk;
          setChatMessages(prev => {
            const newHistory = [...prev];
            const lastMsg = newHistory[newHistory.length - 1];
            if (lastMsg.role === 'model') {
              lastMsg.text = fullAnswer;
            }
            return newHistory;
          });
        }
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "魔法中断了...", isError: true }]);
    } finally {
      setIsChatting(false);
    }
  };

  const goBackToBookshelf = async () => {
    if (file && fileFingerprint) await saveFileToHistory(fileFingerprint, file, fullText, summary);
    await clearActiveSession(); 
    setFile(null); setFileFingerprint(null); setMode(AppMode.UPLOAD);
    loadHistoryList(); 
  };
  
  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 2000); };
  const handleCatClick = () => { setCatMood('SUCCESS'); setCatMessage("喵呜！学术猫正在待命！"); setTimeout(() => setCatMood('IDLE'), 2000); };

  // Resizing Logic
  const startResizing = useCallback(() => { isResizing.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, []);
  const stopResizing = useCallback(() => { isResizing.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }, []);
  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setLeftWidth(newWidth);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResizing);
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); };
  }, [resize, stopResizing]);

  // PDF Load Callback
  const handleDocumentLoad = (pdf: any) => {
    setPdfDocument(pdf);
    setNumPages(pdf.numPages);
  };

  const handleJumpToDest = (_dest: any, pageIndex?: number) => {
    if (pageIndex) setCurrentPage(pageIndex);
  };

  // --- RENDER: BOOKSHELF ---
  if (mode === AppMode.UPLOAD) {
    return (
       <div className="min-h-screen bg-[#2c1810] flex flex-col items-center p-4 relative overflow-hidden" onDrop={handleDrop} onDragOver={(e) => {e.preventDefault(); e.stopPropagation();}}>
        <CursorSystem />
        <div className="max-w-4xl w-full text-center space-y-4 animate-in fade-in duration-700 relative z-10 mt-10">
          <div>
              <div className="bg-[#8B4513] w-16 h-16 mx-auto flex items-center justify-center mb-4 rpg-border shadow-[4px_4px_0_0_#1a0f0a]">
               <BookOpenIcon className="text-[#DAA520] w-8 h-8" />
             </div>
             <h1 className="text-3xl font-bold text-[#e8e4d9] mb-2 pixel-font">Scholar Scroll</h1>
             <p className="text-sm text-[#DAA520] serif italic">研读卷轴 · 书架 (The Bookshelf)</p>
          </div>
          <div className="bg-[#e8e4d9] p-6 rpg-border hover:brightness-110 transition-all cursor-pointer group relative shadow-[8px_8px_0_0_#1a0f0a] max-w-md mx-auto">
            <input type="file" accept=".pdf" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#2c1810] rounded-full flex items-center justify-center border-2 border-[#DAA520]">
                <UploadIcon className="w-6 h-6 text-[#DAA520]" />
              </div>
              <div className="text-left">
                <p className="font-bold text-base text-[#2c1810] pixel-font">召唤新卷轴</p>
                <p className="text-xs text-[#5c4033] serif">Drag & Drop or Click to Upload</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-4xl w-full mt-12 z-10 pb-20">
          <h2 className="text-[#DAA520] pixel-font text-xs mb-4 border-b border-[#DAA520]/30 pb-2">最近阅读 (RECENT SCROLLS)</h2>
          {historyList.length === 0 ? (
            <p className="text-[#8B4513] text-center text-sm italic mt-8">暂无阅读记录...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {historyList.map((item) => (
                 <div key={item.fingerprint} onClick={() => openFromHistory(item.fingerprint)} className="bg-[#3e2723] border-2 border-[#8B4513] p-4 rounded hover:bg-[#4e342e] transition-colors cursor-pointer group relative shadow-lg">
                    <div className="flex justify-between items-start">
                       <h3 className="text-[#e8e4d9] font-bold text-sm line-clamp-2 mb-2 pr-6 h-10">{item.name}</h3>
                       <button onClick={(e) => handleDeleteHistory(e, item.fingerprint)} className="text-[#8B4513] hover:text-red-400 absolute top-2 right-2"><XIcon className="w-4 h-4" /></button>
                    </div>
                    <div className="text-[10px] text-[#DAA520]/80 space-y-1 mt-2">
                       <p>📅 {new Date(item.lastOpenedAt).toLocaleDateString()}</p>
                       <p>🏷️ {item.summary?.title ? "已解析" : "未解析"}</p>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
        {toastMessage && <div className="fixed bottom-8 right-8 z-50 animate-bounce bg-[#2c1810] text-[#DAA520] p-3 rounded-lg border-2 border-[#DAA520]">{toastMessage}</div>}
      </div>
    );
  }

  // --- RENDER: READING MODE ---
  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans ${appearance.theme === 'sepia' ? 'bg-[#F4ECD8]' : 'bg-[#2c1810]'}`}>
      <CursorSystem />
      <div className={`h-16 border-b-4 flex items-center px-4 justify-between shrink-0 shadow-lg z-50 ${appearance.theme === 'sepia' ? 'bg-[#e8e4d9] border-[#8B4513]' : 'bg-[#2c1810] border-[#8B4513]'}`}>
         <div className="flex items-center gap-3">
           <div className="bg-[#DAA520] p-1 border-2 border-[#e8e4d9]"><BookOpenIcon className="w-6 h-6 text-[#2c1810]" /></div>
           <span className="font-bold pixel-font text-xs tracking-widest hidden md:block text-[#8B4513]">SCHOLAR SCROLL</span>
           <span className="h-6 w-1 bg-[#8B4513] mx-2"></span>
           <span className="text-xs font-bold text-[#DAA520] truncate max-w-[200px] pixel-font">{file?.name}</span>
         </div>
         <div className="flex gap-2 items-center">
            {['DUAL', SidebarTab.SUMMARY, SidebarTab.CHAT, SidebarTab.NOTES].map((tab) => (
             <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-3 py-2 text-[10px] font-bold transition-all pixel-font border-2 ${activeTab === tab ? 'bg-[#DAA520] text-[#2c1810] border-[#e8e4d9]' : 'bg-[#2c1810] text-[#DAA520] border-[#8B4513] hover:bg-[#3e2723]'}`}>
               {tab === 'DUAL' ? 'READ' : tab}
             </button>
            ))}
            <div className="relative">
              <button onClick={() => setShowSettings(!showSettings)} className={`p-2 border-2 transition-all ${showSettings ? 'bg-[#DAA520] text-[#2c1810] border-[#2c1810]' : 'border-[#DAA520] text-[#DAA520] hover:bg-[#DAA520]/10'}`}><SettingsIcon className="w-5 h-5"/></button>
              {showSettings && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowSettings(false)}></div>
                  <div className="absolute top-14 right-0 w-72 bg-[#e8e4d9] border-4 border-[#2c1810] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] p-5 z-50 rounded-sm animate-in zoom-in-95 duration-200 select-none">
                    <div className="flex items-center gap-2 mb-4 border-b-2 border-[#8B4513]/20 pb-2"><span className="text-lg">🛠️</span><h4 className="pixel-font text-xs font-bold text-[#2c1810] uppercase tracking-wider">Configuration</h4></div>
                    <div className="space-y-5">
                      <div>
                        <label className="text-[10px] font-bold text-[#8B4513] mb-2 block pixel-font">VISUAL THEME</label>
                        <div className="flex gap-2">
                            <button onClick={() => setAppearance(p => ({...p, theme: 'sepia'}))} className={`flex-1 py-2 text-xs font-bold border-2 ${appearance.theme === 'sepia' ? 'bg-[#DAA520] text-[#2c1810] border-[#2c1810]' : 'bg-[#f4ecd8] text-[#5c4033] border-[#8B4513]'}`}>Sepia</button>
                            <button onClick={() => setAppearance(p => ({...p, theme: 'dark'}))} className={`flex-1 py-2 text-xs font-bold border-2 ${appearance.theme === 'dark' ? 'bg-[#DAA520] text-[#2c1810] border-[#2c1810]' : 'bg-[#2c1810] text-[#DAA520] border-[#DAA520]'}`}>Dark</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#8B4513] mb-2 block pixel-font">RUNE SIZE</label>
                        <div className="flex items-center border-2 border-[#8B4513] bg-[#fffef0] rounded overflow-hidden">
                           <button onClick={() => setAppearance(p => ({...p, fontSize: Math.max(12, p.fontSize - 1)}))} className="px-3 py-1 hover:bg-[#DAA520] text-[#8B4513] border-r border-[#8B4513]">-</button>
                           <span className="flex-1 text-center text-xs font-serif text-[#2c1810]">{appearance.fontSize}px</span>
                           <button onClick={() => setAppearance(p => ({...p, fontSize: Math.min(24, p.fontSize + 1)}))} className="px-3 py-1 hover:bg-[#DAA520] text-[#8B4513] border-l border-[#8B4513]">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#8B4513] mb-2 block pixel-font">MAGIC SOURCE</label>
                        <div className="flex flex-col gap-2">
                           <label className="flex items-center gap-2 cursor-pointer"><div className={`w-4 h-4 border-2 flex items-center justify-center ${aiModel === 'gemini' ? 'border-[#DAA520] bg-[#2c1810]' : 'border-[#8B4513]'}`}>{aiModel === 'gemini' && <div className="w-2 h-2 bg-[#DAA520]"></div>}</div><input type="radio" className="hidden" checked={aiModel === 'gemini'} onChange={() => setAiModel('gemini')} /><span className="text-xs font-bold text-[#2c1810]">Gemini 2.0 Flash (Fast)</span></label>
                           <label className="flex items-center gap-2 cursor-pointer"><div className={`w-4 h-4 border-2 flex items-center justify-center ${aiModel === 'deepseek' ? 'border-[#DAA520] bg-[#2c1810]' : 'border-[#8B4513]'}`}>{aiModel === 'deepseek' && <div className="w-2 h-2 bg-[#DAA520]"></div>}</div><input type="radio" className="hidden" checked={aiModel === 'deepseek'} onChange={() => setAiModel('deepseek')} /><span className="text-xs font-bold text-[#2c1810]">DeepSeek V3 (Reasoning)</span></label>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button onClick={goBackToBookshelf} className={`p-2 flex items-center gap-1 border border-transparent rounded transition-colors ${appearance.theme === 'sepia' ? 'text-[#2c1810] hover:text-[#8B4513]' : 'text-[#e8e4d9] hover:text-[#DAA520]'}`}><span className="text-xs font-bold pixel-font hidden md:inline">EXIT</span><XIcon className="w-6 h-6" /></button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* 左侧区域：目录 + PDF */}
        <div className="h-full relative flex bg-[#5c4033]" style={{ width: `${leftWidth}%` }}>
          
          {/* 目录栏 */}
          {showOutline && file && (
            <div className="w-48 shrink-0 h-full hidden md:block animate-in slide-in-from-left duration-300 border-r border-[#8B4513]">
              <PDFOutline 
                pdfDocument={pdfDocument} 
                onJumpToDest={handleJumpToDest}
                currentPage={currentPage}
                totalPage={numPages}
              />
            </div>
          )}

          {/* PDF Viewer */}
          <div className="flex-1 h-full relative">
             <button 
               onClick={() => setShowOutline(!showOutline)}
               className="absolute top-2 left-2 z-30 bg-[#2c1810] text-[#DAA520] px-2 py-1 text-[10px] rounded border border-[#8B4513] opacity-80 hover:opacity-100 font-bold pixel-font"
               title="Toggle Outline"
             >
               {showOutline ? '◀' : '▶ TOC'}
             </button>

             {file && (
               <PDFViewer 
                 ref={pdfContainerRef}
                 fileUrl={file.url}
                 pageNumber={currentPage}
                 onPageChange={setCurrentPage}
                 onPageRendered={() => {}} 
                 highlightText={highlightText} 
                 onTextSelected={handleContextSelection}
                 onTextHover={setPdfSelectedText} 
                 onDocumentLoad={handleDocumentLoad} // 绑定
               />
             )}
          </div>
        </div>

        {/* 拖拽条 */}
        <div className="w-2 bg-[#2c1810] border-l border-r border-[#8B4513] cursor-col-resize hover:bg-[#DAA520] z-40 flex items-center justify-center relative group" onMouseDown={startResizing}>
          <div className="absolute inset-y-0 -left-2 -right-2 z-50 cursor-col-resize"></div>
          <GripVerticalIcon className="w-4 h-4 text-[#8B4513] group-hover:text-[#2c1810]" />
        </div>

        {/* 右侧区域 */}
        <div className="h-full relative" style={{ width: `${100 - leftWidth}%`, backgroundColor: appearance.theme === 'sepia' ? '#F4ECD8' : '#2c1810' }}>
          {activeTab === 'DUAL' && (
               <TranslationViewer 
               translation={pageTranslations.get(debouncedPage)}
               isLoading={isTranslatingPage}
               onHoverBlock={setHighlightText} 
               highlightText={pdfSelectedText} 
               onRetry={async () => {
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
          {activeTab === SidebarTab.SUMMARY && <div className="p-0 h-full overflow-y-auto bg-[#e8e4d9]"><SummaryView summary={summary} isLoading={isSummarizing} error={null} onRetry={retrySummary} /></div>}
          {activeTab === SidebarTab.CHAT && <ChatInterface messages={chatMessages} onSendMessage={handleSendMessage} isSending={isChatting} />}
          {activeTab === SidebarTab.NOTES && (
            <div className="p-6 h-full overflow-y-auto bg-[#e8e4d9] space-y-4">
              <h3 className="font-bold pixel-font text-[#2c1810]">魔法笔记 (Saved Notes)</h3>
              {notes.map(note => (<div key={note.id} className="bg-[#fffef0] p-3 border-2 border-[#8B4513] rounded"><p className="text-[#2c1810] serif text-sm">{note.text}</p></div>))}
            </div>
          )}
        </div>
        
        {toastMessage && <div className="absolute bottom-8 right-8 z-50 animate-bounce bg-[#2c1810] text-[#DAA520] p-3 rounded-lg border-2 border-[#DAA520]">{toastMessage}</div>}

        {(isAnalyzingCitation || citationInfo) && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[#e8e4d9] border-4 border-[#2c1810] p-4 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
              <button onClick={() => {setCitationInfo(null); setIsAnalyzingCitation(false)}} className="absolute top-2 right-2 font-bold p-1 hover:bg-black/10 rounded">X</button>
              {isAnalyzingCitation ? <p className="p-4 text-center">正在检索古卷...</p> : (
                <div className="space-y-2"><h3 className="font-bold text-lg">{citationInfo?.title}</h3><p className="text-sm italic">{citationInfo?.year}</p><p className="text-sm">{citationInfo?.abstract}</p></div>
              )}
            </div>
          </div>
        )}

        {(isAnalyzingEquation || equationExplanation) && (
          <div className="absolute bottom-0 w-full bg-[#2c1810] border-t-4 border-[#DAA520] p-4 text-[#e8e4d9] z-50 max-h-40 overflow-y-auto animate-in slide-in-from-bottom duration-300">
             <div className="flex justify-between mb-2"><span className="font-bold text-[#DAA520] pixel-font">Magic Lens</span><button onClick={() => {setEquationExplanation(null); setIsAnalyzingEquation(false)}}>X</button></div>
             {isAnalyzingEquation ? "解析中..." : equationExplanation}
          </div>
        )}

        <ScholarCatMascot mood={catMood} message={catMessage} onClick={handleCatClick} />
      </div>
    </div>
  );
};

export default App;
