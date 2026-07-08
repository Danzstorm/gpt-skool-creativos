"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative my-2 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-2.5 py-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Prompt</span>
        <button
          onClick={copy}
          className={cn(
            "flex items-center gap-1 text-xs rounded-lg px-2 py-0.5 transition",
            copied
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700"
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="bg-zinc-950 p-2.5 overflow-x-auto text-[11px] leading-snug font-mono whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

export default function MessageContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-normal">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-violet-400 underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-700 px-2 py-1">{children}</td>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "") || String(children).includes("\n");
            if (isBlock) return <CodeBlock>{String(children).replace(/\n$/, "")}</CodeBlock>;
            return (
              <code className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-xs font-mono">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
