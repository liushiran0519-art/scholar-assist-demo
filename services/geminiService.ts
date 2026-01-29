import { GoogleGenAI, Type } from "@google/genai";
import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models
const SUMMARY_MODEL = '[贩子死妈]gemini-3-flash-preview'; // Fast & Cheap for large text
const TRANSLATION_MODEL = '[尝尝我的大香蕉]gemini-3-pro-image-preview'; // Multimodal for page screenshots
const CHAT_MODEL = '[贩子死妈]gemini-3-flash-preview'; // Fast interactive chat

export const generatePaperSummary = async (text: string): Promise<PaperSummary> => {
  // Optimization: Truncate text to ~30k chars to reduce API cost/latency 
  // while keeping Abstract, Intro, and usually Conclusion (depending on paper length)
  const truncatedText = text.slice(0, 30000); 

  const response = await ai.models.generateContent({
    model: SUMMARY_MODEL,
    contents: `Analyze this academic paper text and generate a structured summary.
    
    Text (First ~30k chars): ${truncatedText}
    
    Return a JSON object in CHINESE (简体中文) with the following structure:
    - title: Translated title
    - tags: 3-5 keywords
    - tldr: { painPoint (what problem), solution (what method), effect (result) }
    - methodology: list of key steps
    - takeaways: list of key insights`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            tldr: {
                type: Type.OBJECT,
                properties: {
                    painPoint: { type: Type.STRING },
                    solution: { type: Type.STRING },
                    effect: { type: Type.STRING }
                }
            },
            methodology: { type: Type.ARRAY, items: { type: Type.STRING } },
            takeaways: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text) as PaperSummary;
  }
  throw new Error("Summary generation failed");
};

export const translatePageContent = async (imageBase64: string): Promise<PageTranslation> => {
  const response = await ai.models.generateContent({
    model: TRANSLATION_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: `Analyze this page of an academic paper.
        1. Identify main content blocks (paragraphs, headings).
        2. Translate them into academic Chinese.
        3. Identify 2-3 key technical terms for a glossary.

        Return JSON format.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['paragraph', 'heading', 'list'] },
                en: { type: Type.STRING },
                cn: { type: Type.STRING }
              }
            }
          },
          glossary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  if (response.text) {
     const data = JSON.parse(response.text);
     return {
       pageNumber: 0, // Will be set by caller
       blocks: data.blocks || [],
       glossary: data.glossary || []
     };
  }
  throw new Error("Translation failed");
};

export const chatWithPaper = async (history: { role: 'user' | 'model'; text: string }[], newMessage: string, fileBase64: string, mimeType: string): Promise<string> => {
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: [
       {
         role: 'user',
         parts: [
           { inlineData: { mimeType: mimeType, data: fileBase64 } },
           { text: "This is the paper we are discussing." }
         ]
       },
       {
         role: 'model',
         parts: [{ text: "Understood. I have read the paper. Please ask me anything." }]
       },
       ...history.map(h => ({
         role: h.role,
         parts: [{ text: h.text }]
       }))
    ],
    config: {
      systemInstruction: "You are an expert academic assistant. Answer questions based on the provided paper. Keep answers concise and helpful. Use Chinese."
    }
  });

  const result = await chat.sendMessage({ message: newMessage });
  return result.text || "Thinking...";
};

export const analyzeCitation = async (citationId: string, fileBase64: string, mimeType: string): Promise<CitationInfo> => {
    // Mock logic or simple extraction, real implementation would extract context
    // Here we act as an Oracle hallucinating/predicting based on the context window
    const response = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: {
            parts: [
                { inlineData: { mimeType: mimeType, data: fileBase64 } },
                { text: `Find the citation/reference labelled "${citationId}" in this paper. 
                Extract its Title, Year, and infer an Abstract or Context. 
                Decide if it is "MUST_READ" (critical to methodology) or "SKIMMABLE".
                Return JSON.` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    year: { type: Type.STRING },
                    abstract: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ["MUST_READ", "SKIMMABLE"] }
                }
            }
        }
    });
    
    if (response.text) return JSON.parse(response.text);
    throw new Error("Citation analysis failed");
};

export const explainEquation = async (equationImageOrText: string): Promise<string> => {
    // If it's text
    const response = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: `Explain this equation/formula in simple terms for a grad student: ${equationImageOrText}`,
    });
    return response.text || "Could not explain.";
};
