import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperFile, PaperSummary, SidebarTab, ChatMessage, AppMode, PageTranslation, CitationInfo, AppearanceSettings, Note } from './types';
// ✅ 引入 base64ToBlobUrl
import { extractTextFromPdf, extractPageText, fileToBase64, base64ToBlobUrl } from './utils/pdfUtils';
import { generateFingerprint, getSummary, saveSummary, getPageTranslation, savePageTranslation, saveActiveSession, getActiveSession, clearActiveSession, deletePageTranslation, deleteSummary  } from './utils/storage';
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
  const [fullText, setFullText] = useState<string>(""); 
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

  // Cat Mascot State
  const [catMood, setCatMood] = useState<CatMood>('IDLE');
  const [catMessage, setCatMessage] = useState<string | null>(null);

  // --- 0. Cat Mood Logic ---
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

  // --- 1. Session Restoration ---
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const session = await getActiveSession();
        if (session && session.file) {
          console.log("[Session] Found previous session:", session.file.name);
          
          // 🚨 关键修复：从 base64 重新生成 Blob URL
          // 之前的 session.file.url 是旧的 blob: 链接，已经失效了
          let validUrl = session.file.url;
          if (session.file.base64) {
             validUrl = base64ToBlobUrl(session.file.base64, session.file.mimeType);
          }

          // 构建新的文件对象
          const restoredFile: PaperFile = {
            ...session.file,
            url: validUrl // 替换为新生成的有效 URL
          };

          setFile(restoredFile);
          setFileFingerprint(session.fingerprint);
          setCurrentPage(session.currentPage || 1);
          setDebouncedPage(session.currentPage || 1);
          setMode(AppMode.READING);
          
          const cachedData = await getSummary(session.fingerprint);
          if (cachedData) {
            setSummary(cachedData.summary);
            setFullText(cachedData.fullText || "");
          }
        }
      } catch (e) {
        console.error("Session restore failed", e);
        // 如果恢复失败，清空会话防止死循环
        await clearActiveSession();
      }
    };
    restoreSession();
  }, []);

  // --- 2. Save Session ---
  useEffect(() => {
    if (file && fileFingerprint) {
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
    }, 500); 
    return () => clearTimeout(handler);
  }, [currentPage]);

  // --- 4. Main Translation Logic ---
  useEffect(() => {
    const loadTranslation = async () => {
      if (mode !== AppMode.READING || !file || !fileFingerprint) return;
      
      const pageNum = debouncedPage;
      if (pageTranslations.has(pageNum)) return;

      setIsTranslatingPage(true);

      try {
        const cachedTrans = await getPageTranslation(fileFingerprint, pageNum);
        
        // 🔍 检查缓存是否有效 (防止缓存了报错信息)
        // 如果缓存里只有一行且是 Error，就当作没缓存
        const isInvalidCache = cachedTrans && 
          cachedTrans.blocks.length === 1 && 
          (cachedTrans.blocks[0].en === "Error" || cachedTrans.blocks[0].cn.includes("AI 格式错误"));

        if (cachedTrans && !isInvalidCache) {
          console.log(`[Cache] 📖 Page ${pageNum} Hit (DB)`);
          setPageTranslations(prev => new Map(prev).set(pageNum, cachedTrans));
        } else {
          if (isInvalidCache) {
             console.log(`[Cache] 🗑️ 删除无效的缓存 Page ${pageNum}`);
             await deletePageTranslation(fileFingerprint, pageNum);
          }

          console.log(`[API] ⚡ Extracting text & Translating Page ${pageNum}...`);
          const pageText = await extractPageText(file.base64, pageNum);
          
          const newTrans = await translatePageContent(pageText);
          newTrans.pageNumber = pageNum;

          // 🚨 关键修改：只有成功的结果才存入 DB
          // 判断标准：blocks 数量 > 1 或者 第一块不是 Error
          const isSuccess = newTrans.blocks.length > 0 && 
                            newTrans.blocks[0].en !== "Error" && 
                            !newTrans.blocks[0].cn.includes("AI 格式错误");

          if (isSuccess) {
            await savePageTranslation(fileFingerprint, pageNum, newTrans);
          } else {
            console.warn("翻译结果异常，不写入缓存，仅在内存显示");
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      const base64Data = await fileToBase64(selectedFile);
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
      
      try {
        setIsSummarizing(true);
        const cachedData = await getSummary(fingerprint);
        
        if (cachedData) {
          setSummary(cachedData.summary);
          setFullText(cachedData.fullText || "");
          setIsSummarizing(false);
        } else {
          const textContent = await extractTextFromPdf(base64Data);
          setFullText(textContent);
          const newSummary = await generatePaperSummary(textContent);
          await saveSummary(fingerprint, selectedFile.name, newSummary, textContent);
          setSummary(newSummary);
          setIsSummarizing(false);
        }
      } catch (error) {
        console.error("Processing failed:", error);
        setSummary({
          title: "解析失败",
          tags: ["ERROR"],
          tldr: { painPoint: "读取失败", solution: "请检查PDF是否加密", effect: "无" },
          methodology: [],
          takeaways: []
        });
        setIsSummarizing(false);
      }
    }
  };
  const retrySummary = async () => {
  if (!file || !fileFingerprint) return;
  
  setIsSummarizing(true);
  setSummary(null); // 清空当前错误显示
  
  // 1. 删除旧缓存
  await deleteSummary(fileFingerprint);
  
  try {
    // 2. 重新生成
    const textContent = await extractTextFromPdf(file.base64); // 注意：这里可能需要优化，不要重复提取
    // 如果 fullText 已经有值，直接用
    const textToUse = fullText || textContent; 
    
    const newSummary = await generatePaperSummary(textToUse);
    
    // 3. 只有成功才存
    if (!newSummary.tags.includes("ERROR")) {
        await saveSummary(fileFingerprint, file.name, newSummary, textToUse);
    }
    
    setSummary(newSummary);
  } catch (e) {
    console.error(e);
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
    } catch(e) {
      console.error(e);
    } finally {
      setIsAnalyzingCitation(false);
    }
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
        const context = fullText || "No context available."; 
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

  const resetApp = async () => {
    await clearActiveSession();
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

  if (mode === AppMode.UPLOAD) {
    return (
       <div className="min-h-screen bg-[#2c1810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
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
            <button onClick={resetApp} className="text-[#e8e4d9] hover:text-red-400 p-2"><XIcon className="w-6 h-6" /></button>
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
               highlightText={highlightText}
               onTextSelected={handleContextSelection}
             />
          )}
        </div>

        <div 
           className="w-2 bg-[#2c1810] border-l border-r border-[#8B4513] cursor-col-resize hover:bg-[#DAA520] z-40 flex items-center justify-center"
           onMouseDown={startResizing}
        >
          <GripVerticalIcon className="w-4 h-4 text-[#8B4513]" />
        </div>

        <div className="h-full relative" style={{ width: `${100 - leftWidth}%`, backgroundColor: appearance.theme === 'sepia' ? '#F4ECD8' : '#2c1810' }}>
          
          {activeTab === 'DUAL' && (
               <TranslationViewer 
               translation={pageTranslations.get(debouncedPage)}
               isLoading={isTranslatingPage}
               onHoverBlock={setHighlightText}
               onRetry={async () => {
                   // 1. 先从 DB 删除脏数据
                   if (fileFingerprint) {
                     await deletePageTranslation(fileFingerprint, debouncedPage);
                   }
                   // 2. 再清空 React State，触发 useEffect 重新请求
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
                <SummaryView 
                  summary={summary} 
                  isLoading={isSummarizing} 
                  error={null} 
                  onRetry={retrySummary} // ✅ 传递重试函数
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
            <div className="bg-[#e8e4d9] border-4 border-[#2c1810] p-4 max-w-md w-full shadow-2xl relative">
              <button onClick={() => {setCitationInfo(null); setIsAnalyzingCitation(false)}} className="absolute top-2 right-2 font-bold">X</button>
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
          <div className="absolute bottom-0 w-full bg-[#2c1810] border-t-4 border-[#DAA520] p-4 text-[#e8e4d9] z-50 max-h-40 overflow-y-auto">
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
