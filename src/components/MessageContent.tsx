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
    <div className="relative my-1.5 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-2.5 py-0.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Prompt</span>
        <button
          onClick={copy}
          className={cn(
            "flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 transition",
            copied
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-zinc-300 hover:text-ink bg-zinc-800 hover:bg-zinc-700"
          )}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="bg-zinc-950 px-3 py-1.5 overflow-x-auto text-[12px] leading-[1.4] font-mono whitespace-pre-wrap tracking-tight">
        {children}
      </pre>
    </div>
  );
}

export default function MessageContent({ content }: { content: string }) {
  return (
    <div className="text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0 whitespace-pre-wrap">{children}</p>,
          // Headings compactos: sin ellos, react-markdown usa los tamaños/márgenes
          // gigantes del navegador y rompe la escala de 15px.
          h1: ({ children }) => (
            <h1 className="text-[18px] font-semibold text-ink mt-3 mb-1 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[16px] font-semibold text-ink mt-2.5 mb-1 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[15px] font-semibold text-zinc-100 mt-2 mb-0.5 first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[15px] font-medium text-zinc-200 mt-2 mb-0.5 first:mt-0">{children}</h4>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 mb-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-1.5 space-y-0.5">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-700 pl-3 my-1.5 text-zinc-400">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2.5 border-zinc-800" />,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-violet-400 underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-[13px] border-collapse">{children}</table>
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
              <code className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[13px] font-mono">
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
