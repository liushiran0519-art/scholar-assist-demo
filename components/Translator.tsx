import React, { useState } from 'react';
import { translateSelection } from '../services/geminiService';
import { LoaderIcon, LanguagesIcon } from './IconComponents';

const Translator: React.FC = () => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    try {
      const result = await translateSelection(sourceText);
      setTranslatedText(result);
    } catch (e) {
      setTranslatedText("翻译出错，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center gap-2 text-indigo-600 font-medium mb-2">
        <LanguagesIcon className="w-5 h-5" />
        <h2>智能段落翻译</h2>
      </div>
      
      <div className="flex-1 flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase">英文原文</label>
        <textarea
          className="flex-1 w-full p-3 border border-slate-300 rounded-lg resize-none text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
          placeholder="在此粘贴论文中的长难句或段落..."
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
      </div>

      <button
        onClick={handleTranslate}
        disabled={loading || !sourceText.trim()}
        className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors flex justify-center items-center gap-2"
      >
        {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : null}
        {loading ? '翻译中...' : '开始翻译'}
      </button>

      <div className="flex-1 flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase">中文译文</label>
        <div className="flex-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm leading-relaxed overflow-y-auto text-slate-800 serif">
          {translatedText || <span className="text-slate-400 italic">译文将显示在这里...</span>}
        </div>
      </div>
    </div>
  );
};

export default Translator;
