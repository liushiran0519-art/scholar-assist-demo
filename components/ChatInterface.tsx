import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { SendIcon, LoaderIcon } from './IconComponents';
import ReactMarkdown from 'react-markdown';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isSending: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isSending }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-[#e8e4d9]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-[#5c4033] mt-10 p-4 border-2 border-dashed border-[#8B4513] rounded-lg bg-[#f5f2e9] mx-4">
            <div className="text-3xl mb-3">🐱🧙‍♂️</div>
            <p className="mb-2 font-bold pixel-font text-sm text-[#2c1810]">喵？又在啃全英文的‘天书’了吗？</p>
            <p className="text-xs serif mb-4">别怕，本喵来帮你拆解这篇论文！把不懂的句子扔给我吧！</p>
            <div className="mt-4 space-y-2">
              <button 
                onClick={() => setInput("这篇文章的主要创新点是什么？")}
                className="block w-full text-left p-2 text-xs bg-[#e8e4d9] hover:bg-[#DAA520]/20 rounded border border-[#8B4513] transition-colors pixel-font text-[#2c1810]"
              >
                ▷ 这篇文章的主要创新点是什么？
              </button>
              <button 
                onClick={() => setInput("实验数据是否支持作者的结论？")}
                className="block w-full text-left p-2 text-xs bg-[#e8e4d9] hover:bg-[#DAA520]/20 rounded border border-[#8B4513] transition-colors pixel-font text-[#2c1810]"
              >
                ▷ 实验数据是否支持作者的结论？
              </button>
            </div>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded p-3 text-sm leading-relaxed shadow-sm border-2 ${
                msg.role === 'user' 
                  ? 'bg-[#8B4513] text-[#e8e4d9] border-[#2c1810]' 
                  : 'bg-[#f5f2e9] text-[#2c1810] border-[#8B4513]'
              }`}
            >
              {msg.role === 'user' ? (
                 <p className="serif">{msg.text}</p>
              ) : (
                <div className="prose prose-sm prose-p:text-[#2c1810] prose-headings:text-[#8B4513] max-w-none serif">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-[#f5f2e9] border-2 border-[#8B4513] rounded p-3">
              <LoaderIcon className="w-5 h-5 animate-spin text-[#8B4513]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t-2 border-[#2c1810] bg-[#e8e4d9]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="召唤学术猫..."
            className="flex-1 px-4 py-2 border-2 border-[#8B4513] bg-[#f5f2e9] rounded focus:outline-none focus:border-[#DAA520] text-sm text-[#2c1810] placeholder-[#8B4513]/50 pixel-font"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="px-4 py-2 bg-[#8B4513] text-[#DAA520] border-2 border-[#2c1810] rounded hover:bg-[#2c1810] disabled:opacity-50 disabled:cursor-not-allowed transition-colors rpg-btn"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;