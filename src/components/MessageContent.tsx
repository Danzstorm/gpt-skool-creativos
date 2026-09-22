"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // El fence ya vive dentro de `.prompt-card`; no volver a envolverlo
        // en otra tarjeta PROMPT / Copiar.
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <p>{children}</p>,
        h1: ({ children }) => <h1>{children}</h1>,
        h2: ({ children }) => <h2>{children}</h2>,
        h3: ({ children }) => <h3>{children}</h3>,
        h4: ({ children }) => <h4>{children}</h4>,
        ul: ({ children }) => <ul>{children}</ul>,
        ol: ({ children }) => <ol>{children}</ol>,
        blockquote: ({ children }) => <blockquote>{children}</blockquote>,
        hr: () => <hr />,
        strong: ({ children }) => <strong>{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ className, children }) => {
          const text = String(children).replace(/\n$/, "");
          const isBlock = /language-/.test(className || "") || text.includes("\n");
          if (isBlock) return <pre className="prompt-source">{text}</pre>;
          return <code>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
