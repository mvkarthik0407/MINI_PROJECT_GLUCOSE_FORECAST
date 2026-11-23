import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Send, 
  Bot, 
  User, 
  ShieldCheck, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  AlertOctagon,
  FileText,
  BookOpen
} from 'lucide-react';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  citations?: Array<{
    title: string;
    source: string;
    url?: string;
    last_reviewed?: string;
  }>;
  trace?: string[];
}

export const ChatAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: "Hello! I am your DiaTwin AI Decision Support Assistant. I am grounded in the official ADA Standards of Care 2026 and WHO 2026 Clinical Guidelines.\n\nI can answer questions regarding:\n• 🎯 ADA 2026 Glycemic Targets & Time in Range (TIR)\n• 🩸 Hypoglycemia Management & the 15-15 Rule\n• 📋 Diabetes Diagnosis Criteria & T1D Staging\n• 🤰 Diabetes in Pregnancy Guidelines\n• 💉 WHO 2026 Insulin Therapy & Delivery Devices\n• ⚖️ Obesity & Weight Management in Diabetes\n\n⚠️ Non-Negotiable Safety Boundary: I am an investigational support tool and cannot calculate insulin doses, carbohydrate correction factors, or change prescribed treatment.",
      citations: [
        { title: "ADA Standards of Care in Diabetes—2026 (Sec 6: Glycemic Goals)", source: "American Diabetes Association", url: "https://diabetesjournals.org/care/issue/49/Supplement_1" },
        { title: "WHO Guidelines on Insulin Use for Type 1 Diabetes (2026)", source: "World Health Organization", url: "https://www.who.int/publications/i/item/9789240090286" }
      ]
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    setInput('');
    const newMessages: Message[] = [...messages, { sender: 'user', text: textToSend }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const data = await api.sendChat(textToSend);

      const parsedCitations = (data.citations || []).map((c: any) => ({
        title: c.title || 'Clinical Practice Guideline',
        source: c.organization || c.source || 'Official Clinical Body',
        url: c.url || 'https://diabetesjournals.org/care/issue/49/Supplement_1',
        last_reviewed: c.last_reviewed_date
      }));

      const parsedTrace = (data.agent_trace || []).map((t: any) => {
        if (typeof t === 'string') return t;
        const ag = t.agent || 'Router';
        const st = t.step || t.action || t.intent || 'Processed query';
        return `${ag}: ${st}`;
      });

      setMessages([...newMessages, {
        sender: 'assistant',
        text: data.response,
        citations: parsedCitations.length > 0 ? parsedCitations : undefined,
        trace: parsedTrace.length > 0 ? parsedTrace : undefined
      }]);
    } catch (err: any) {
      setMessages([...newMessages, {
        sender: 'assistant',
        text: `Error communicating with AI service: ${err.message || 'Please check backend status.'}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    { label: "🎯 ADA 2026 Glycemic Targets", prompt: "What are the ADA 2026 glycemic goals and Time in Range targets?" },
    { label: "🩸 15-15 Rule for Lows", prompt: "Explain the 15-15 rule for managing hypoglycemia" },
    { label: "📋 Diagnosis Criteria & Stages", prompt: "What are the criteria for diagnosing diabetes and Stage 1-3 Type 1 diabetes?" },
    { label: "🤰 Pregnancy Targets", prompt: "What are the ADA 2026 glucose and CGM targets in pregnancy?" },
    { label: "💉 WHO 2026 Insulin Guidelines", prompt: "What are the WHO 2026 recommendations on basal-bolus insulin and pen devices?" },
    { label: "⚖️ Obesity & Weight Management", prompt: "What are the ADA 2026 recommendations for weight management and GLP-1 therapy?" },
    { label: "📈 GRU Conformal Twin", prompt: "How does the 2-Layer GRU Digital Twin calculate conformal prediction intervals?" }
  ];

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 flex flex-col h-[calc(100dvh-180px)] sm:h-[650px] max-w-xl mx-auto overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
              <span>DiaTwin Clinical Assistant</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>2026 Guidelines</span>
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">ADA 2026 • WHO 2026 • Non-Prescriptive</p>
          </div>
        </div>

        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-200/60"
        >
          <span>Trace</span>
          {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.sender === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-2.5 ${
              m.sender === 'user' 
                ? 'bg-blue-600 text-white shadow-xs rounded-br-xs' 
                : 'bg-slate-100 text-slate-800 rounded-bl-xs border border-slate-200/60'
            }`}>
              <div className="whitespace-pre-wrap font-medium">{m.text}</div>

              {/* Citations Cards */}
              {m.citations && m.citations.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-blue-600" />
                    <span>Evidence / Trusted Sources (2026):</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {m.citations.map((c, cIdx) => (
                      <a
                        key={cIdx}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-[11px] text-slate-700 hover:text-blue-700 transition-all flex items-center justify-between"
                      >
                        <div className="truncate pr-1">
                          <div className="font-bold truncate">{c.title}</div>
                          <div className="text-[9px] text-slate-400">{c.source}</div>
                        </div>
                        <ExternalLink className="w-3 h-3 flex-shrink-0 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent Trace Debug Drawer */}
              {showDebug && m.trace && (
                <div className="p-2 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[9px] space-y-0.5">
                  <div className="text-slate-400 font-sans font-bold">Execution Trace:</div>
                  {m.trace.map((tr, tIdx) => (
                    <div key={tIdx}>&gt; {tr}</div>
                  ))}
                </div>
              )}
            </div>

            {m.sender === 'user' && (
              <div className="w-7 h-7 rounded-xl bg-slate-800 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5 items-center text-xs text-slate-400 animate-pulse px-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <span>Consulting 2026 clinical guidelines & twin context...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts (Clickable chips) */}
      <div className="px-3 py-2 bg-slate-50/90 border-t border-slate-100 flex gap-1.5 overflow-x-auto text-[11px] flex-shrink-0 no-scrollbar">
        {samplePrompts.map((item, pIdx) => (
          <button
            key={pIdx}
            onClick={() => handleSend(item.prompt)}
            className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-full text-slate-700 whitespace-nowrap active:scale-95 transition-all flex-shrink-0 text-[10px] font-bold shadow-2xs"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <div className="p-2.5 bg-white border-t border-slate-100 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-1.5 items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask ADA/WHO 2026 guidelines, TIR, 15-15 rule..."
            className="flex-1 px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-slate-50/50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl font-bold text-xs shadow-sm transition-all disabled:opacity-40 flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
