================================================
FILE: App.tsx
================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperFile, PaperSummary, SidebarTab, ChatMessage, AppMode, PageTranslation, CitationInfo, AppearanceSettings, Note } from './types';
import { extractTextFromPdf, extractPageText, fileToBase64, base64ToBlobUrl } from './utils/pdfUtils';
import { generateFingerprint, saveFileToHistory, getAllHistory, getFileFromHistory, deleteFromHistory, updateSummaryInHistory, getPageTranslation, savePageTranslation, deletePageTranslation, saveActiveSession, getActiveSession, clearActiveSession } from './utils/storage';
import { generatePaperSummary, chatWithPaper, translatePageContent, analyzeCitation, explainEquation } from './services/geminiService';
import { chatWithDeepSeek } from './services/deepseekService';
import SummaryView from './components/SummaryView';
import ChatInterface from './components/ChatInterface';
import TranslationViewer from './components/TranslationViewer';
import PDFViewer from './components/PDFViewer';
import { ScholarCatMascot, CatMood } from './components/ScholarCatMascot';
import { UploadIcon, BookOpenIcon, XIcon, SettingsIcon, GripVerticalIcon, StarIcon } from './components/IconComponents';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [file, setFile] = useState<PaperFile | null>(null);
  const [fileFingerprint, setFileFingerprint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | 'DUAL'>('DUAL');
  const [aiModel, setAiModel] = useState<'gemini' | 'deepseek'>('gemini');
  
  // History State
  const [historyList, setHistoryList] = useState<any[]>([]);

  // PDF State
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedPage, setDebouncedPage] = useState(1);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  const [pdfSelectedText, setPdfSelectedText] = useState<string | null>(null); // 新增：PDF 选中的文本

  // Layout State (持久化)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('scholar_layout_width');
    return saved ? parseFloat(saved) : 50;
  });
  const isResizing = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Settings (持久化)
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
    // 按时间倒序
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

  // --- 5. Main Translation Logic ---
  useEffect(() => {
    const loadTranslation = async () => {
      if (mode !== AppMode.READING || !file || !fileFingerprint) return;
      
      const pageNum = debouncedPage;
      if (pageTranslations.has(pageNum)) return;

      setIsTranslatingPage(true);

      try {
        const cachedTrans = await getPageTranslation(fileFingerprint, pageNum);
        const isInvalidCache = cachedTrans && 
          cachedTrans.blocks.length === 1 && 
          (cachedTrans.blocks[0].en === "Error" || cachedTrans.blocks[0].cn.includes("AI 格式错误"));

        if (cachedTrans && !isInvalidCache) {
          console.log(`[Cache] 📖 Page ${pageNum} Hit (DB)`);
          setPageTranslations(prev => new Map(prev).set(pageNum, cachedTrans));
        } else {
          if (isInvalidCache) {
             await deletePageTranslation(fileFingerprint, pageNum);
          }

          console.log(`[API] ⚡ Extracting text & Translating Page ${pageNum}...`);
          const pageText = await extractPageText(file.base64, pageNum);
          
          const newTrans = await translatePageContent(pageText);
          newTrans.pageNumber = pageNum;

          const isSuccess = newTrans.blocks.length > 0 && 
                            newTrans.blocks[0].en !== "Error" && 
                            !newTrans.blocks[0].cn.includes("AI 格式错误");

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
  }, [debouncedPage, fileFingerprint, mode, file]); 

  // --- 🆕 6. Persistence Effects (Settings & Layout) ---
  useEffect(() => {
    localStorage.setItem('scholar_layout_width', leftWidth.toString());
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem('scholar_appearance', JSON.stringify(appearance));
  }, [appearance]);

  // --- 🆕 7. Hotkeys (Keyboard Support) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.key) {
        case 'ArrowLeft':
          if (mode === AppMode.READING && currentPage > 1) {
            setCurrentPage(p => p - 1);
          }
          break;
        case 'ArrowRight':
          if (mode === AppMode.READING) {
             // 简单的翻页逻辑，react-pdf 会处理边界
             setCurrentPage(p => p + 1); 
          }
          break;
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


  // --- File Handling (Upload & Drop) ---
  
  // 提取通用的文件处理逻辑
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
      const errorSummary: PaperSummary = {
        title: "解析失败",
        tags: ["ERROR"],
        tldr: { painPoint: "读取失败", solution: "请重试", effect: "无" },
        methodology: [],
        takeaways: []
      };
      setSummary(errorSummary);
      setIsSummarizing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      await processUploadedFile(event.target.files[0]);
    }
  };

  // 🆕 拖拽上传处理
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type !== 'application/pdf') {
          showToast("请投喂 PDF 卷轴喵！(PDF only)");
          return;
      }
      await processUploadedFile(file);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // --- History Handling ---
  const openFromHistory = async (fingerprint: string, savedPage: number = 1) => {
    try {
      const record = await getFileFromHistory(fingerprint);
      if (!record) {
          showToast("文件已丢失或损坏");
          return;
      }

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
      
      // 更新最后阅读时间
      await saveFileToHistory(fingerprint, restoredFile, record.fullText, record.summary);
    } catch (e) {
      console.error("Failed to open from history", e);
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

  
  const retrySummary = async () => {
    if (!file) return;
    setIsSummarizing(true);
    setSummary(null); 
    
    try {
      let text = await extractTextFromPdf(file.base64);
      if (!text || text.length < 100) {
         throw new Error("Text extraction failed");
      }
      
      const newSummary = await generatePaperSummary(text);
      setSummary(newSummary);
      
      if (fileFingerprint) {
         await updateSummaryInHistory(fileFingerprint, newSummary);
      }
    } catch (e) {
      console.error(e);
      setSummary({
          title: "重试失败",
          tags: ["ERROR"],
          tldr: { painPoint: "依然无法解析", solution: "可能是文件已加密或为空", effect: "无" },
          methodology: [],
          takeaways: []
      });
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

  const handleSendMessage = async (text: string) => {
    const newUserMsg: ChatMessage = { role: 'user', text };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatting(true);
    try {
      let answer = '';
      const context = fullText || "No context available."; 
      if (aiModel === 'deepseek') {
        answer = await chatWithDeepSeek(text) || "Error";
      } else {
        const historyForApi = chatMessages.map(m => ({ role: m.role, text: m.text }));
        answer = await chatWithPaper(historyForApi, text, context);
      }
      setChatMessages(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "喵？魔法网络似乎断开了...", isError: true }]);
    } finally {
      setIsChatting(false);
    }
  };

  const goBackToBookshelf = async () => {
    if (file && fileFingerprint) {
        await saveFileToHistory(fileFingerprint, file, fullText, summary);
    }
    
    await clearActiveSession(); 
    setFile(null);
    setFileFingerprint(null);
    setMode(AppMode.UPLOAD);
    loadHistoryList(); 
  };
  
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleCatClick = () => {
    setCatMood('SUCCESS');
    setCatMessage("喵呜！学术猫正在待命！");
    setTimeout(() => setCatMood('IDLE'), 2000);
  };

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

  // --- RENDER: BOOKSHELF MODE ---
  if (mode === AppMode.UPLOAD) {
    return (
       <div 
        className="min-h-screen bg-[#2c1810] flex flex-col items-center p-4 relative overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
       >
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
            {/* 拖拽提示遮罩 */}
            <div className="absolute inset-0 bg-[#DAA520]/20 hidden group-hover:flex items-center justify-center pointer-events-none">
                <p className="pixel-font text-[#2c1810] font-bold">DROP SCROLL HERE!</p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl w-full mt-12 z-10 pb-20">
          <h2 className="text-[#DAA520] pixel-font text-xs mb-4 border-b border-[#DAA520]/30 pb-2">最近阅读 (RECENT SCROLLS)</h2>
          
          {historyList.length === 0 ? (
            <p className="text-[#8B4513] text-center text-sm italic mt-8">暂无阅读记录，请上传第一份卷轴...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {historyList.map((item) => (
                 <div 
                    key={item.fingerprint}
                    onClick={() => openFromHistory(item.fingerprint)}
                    className="bg-[#3e2723] border-2 border-[#8B4513] p-4 rounded hover:bg-[#4e342e] transition-colors cursor-pointer group relative shadow-lg"
                 >
                    <div className="flex justify-between items-start">
                       <h3 className="text-[#e8e4d9] font-bold text-sm line-clamp-2 mb-2 pr-6 h-10">{item.name}</h3>
                       <button 
                         onClick={(e) => handleDeleteHistory(e, item.fingerprint)}
                         className="text-[#8B4513] hover:text-red-400 absolute top-2 right-2"
                         title="销毁卷轴"
                       >
                         <XIcon className="w-4 h-4" />
                       </button>
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
        {toastMessage && (
          <div className="fixed bottom-8 right-8 z-50 animate-bounce bg-[#2c1810] text-[#DAA520] p-3 rounded-lg border-2 border-[#DAA520]">
              {toastMessage}
          </div>
        )}
      </div>
    );
  }

  // --- RENDER: READING MODE ---
  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans ${appearance.theme === 'sepia' ? 'bg-[#F4ECD8]' : 'bg-[#2c1810]'}`}>
      <div className={`h-16 border-b-4 flex items-center px-4 justify-between shrink-0 shadow-lg z-50 ${appearance.theme === 'sepia' ? 'bg-[#e8e4d9] border-[#8B4513]' : 'bg-[#2c1810] border-[#8B4513]'}`}>
         <div className="flex items-center gap-3">
           <div className="bg-[#DAA520] p-1 border-2 border-[#e8e4d9]">
             <BookOpenIcon className="w-6 h-6 text-[#2c1810]" />
           </div>
           <span className="font-bold pixel-font text-xs tracking-widest hidden md:block text-[#8B4513]">SCHOLAR SCROLL</span>
           <span className="h-6 w-1 bg-[#8B4513] mx-2"></span>
           <span className="text-xs font-bold text-[#DAA520] truncate max-w-[200px] pixel-font">{file?.name}</span>
         </div>
         <div className="flex gap-2 items-center">
            {['DUAL', SidebarTab.SUMMARY, SidebarTab.CHAT, SidebarTab.NOTES].map((tab) => (
             <button 
               key={tab}
               onClick={() => setActiveTab(tab as any)}
               className={`px-3 py-2 text-[10px] font-bold transition-all pixel-font border-2 ${activeTab === tab ? 'bg-[#DAA520] text-[#2c1810] border-[#e8e4d9]' : 'bg-[#2c1810] text-[#DAA520] border-[#8B4513] hover:bg-[#3e2723]'}`}
             >
               {tab === 'DUAL' ? 'READ' : tab}
             </button>
            ))}

            <button onClick={() => setShowSettings(!showSettings)} className="p-2 border-2 border-[#DAA520] text-[#DAA520]"><SettingsIcon className="w-5 h-5"/></button>
            
            {showSettings && (
                <div className="absolute top-16 right-4 w-64 bg-[#e8e4d9] border-4 border-[#2c1810] shadow-xl p-4 z-50 rounded">
                  <h4 className="pixel-font text-xs font-bold mb-4 text-[#2c1810]">外观 (APPEARANCE)</h4>
                  <div className="flex gap-2 mb-4">
                      <button onClick={() => setAppearance(p => ({...p, theme: 'sepia'}))} className="flex-1 border-2 border-[#8B4513] text-[#2c1810] text-xs font-bold p-1">羊皮纸</button>
                      <button onClick={() => setAppearance(p => ({...p, theme: 'dark'}))} className="flex-1 bg-[#2c1810] text-[#DAA520] text-xs font-bold p-1">暗夜</button>
                  </div>
                </div>
            )}

            <button 
              onClick={goBackToBookshelf} 
              className={`p-2 flex items-center gap-1 border border-transparent rounded transition-colors 
                ${appearance.theme === 'sepia' 
                  ? 'text-[#2c1810] hover:text-[#8B4513] hover:bg-[#2c1810]/10' 
                  : 'text-[#e8e4d9] hover:text-[#DAA520] hover:bg-[#e8e4d9]/10'
                }`}
              title="返回书架"
            >
              <span className="text-xs font-bold pixel-font hidden md:inline">EXIT</span>
              <XIcon className="w-6 h-6" />
            </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="h-full relative bg-[#5c4033]" style={{ width: `${leftWidth}%` }}>
          {file && (
             <PDFViewer 
               ref={pdfContainerRef}
               fileUrl={file.url}
               pageNumber={currentPage}
               onPageChange={setCurrentPage}
               onPageRendered={() => {}} 
               highlightText={highlightText} // 接收：来自 Translation 的高亮请求
               onTextSelected={handleContextSelection}
               onTextHover={setPdfSelectedText} // 发送：通知 Translation 进行高亮
             />
          )}
        </div>

        {/* 🆕 Resizer: 增加透明点击区域优化拖拽体验 */}
        <div 
           className="w-2 bg-[#2c1810] border-l border-r border-[#8B4513] cursor-col-resize hover:bg-[#DAA520] z-40 flex items-center justify-center relative group"
           onMouseDown={startResizing}
        >
          {/* 透明扩展层 */}
          <div className="absolute inset-y-0 -left-2 -right-2 z-50 cursor-col-resize"></div>
          <GripVerticalIcon className="w-4 h-4 text-[#8B4513] group-hover:text-[#2c1810]" />
        </div>

        <div className="h-full relative" style={{ width: `${100 - leftWidth}%`, backgroundColor: appearance.theme === 'sepia' ? '#F4ECD8' : '#2c1810' }}>
          
          {activeTab === 'DUAL' && (
               <TranslationViewer 
               translation={pageTranslations.get(debouncedPage)}
               isLoading={isTranslatingPage}
               onHoverBlock={setHighlightText} // 发送：通知 PDF 高亮
               highlightText={pdfSelectedText} // 接收：来自 PDF 的选中/悬停文字
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

          {activeTab === SidebarTab.SUMMARY && (
             <div className="p-0 h-full overflow-y-auto bg-[#e8e4d9]">
               <SummaryView 
                  summary={summary} 
                  isLoading={isSummarizing} 
                  error={null} 
                  onRetry={retrySummary} 
               />
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
        
        {toastMessage && (
          <div className="absolute bottom-8 right-8 z-50 animate-bounce bg-[#2c1810] text-[#DAA520] p-3 rounded-lg border-2 border-[#DAA520]">
              {toastMessage}
          </div>
        )}

        {(isAnalyzingCitation || citationInfo) && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[#e8e4d9] border-4 border-[#2c1810] p-4 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
              <button onClick={() => {setCitationInfo(null); setIsAnalyzingCitation(false)}} className="absolute top-2 right-2 font-bold p-1 hover:bg-black/10 rounded">X</button>
              {isAnalyzingCitation ? <p className="p-4 text-center">正在检索古卷...</p> : (
                <div className="space-y-2">
                   <h3 className="font-bold text-lg">{citationInfo?.title}</h3>
                   <p className="text-sm italic">{citationInfo?.year}</p>
                   <p className="text-sm">{citationInfo?.abstract}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {(isAnalyzingEquation || equationExplanation) && (
          <div className="absolute bottom-0 w-full bg-[#2c1810] border-t-4 border-[#DAA520] p-4 text-[#e8e4d9] z-50 max-h-40 overflow-y-auto animate-in slide-in-from-bottom duration-300">
             <div className="flex justify-between mb-2">
               <span className="font-bold text-[#DAA520] pixel-font">Magic Lens</span>
               <button onClick={() => {setEquationExplanation(null); setIsAnalyzingEquation(false)}}>X</button>
             </div>
             {isAnalyzingEquation ? "解析中..." : equationExplanation}
          </div>
        )}

        <ScholarCatMascot 
           mood={catMood} 
           message={catMessage} 
           onClick={handleCatClick} 
        />
      </div>
    </div>
  );
};

export default App;
