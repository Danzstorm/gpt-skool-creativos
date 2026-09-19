"use client";

import { useState } from "react";
import {
  findCandidateByToken,
  parseMentionTokens,
  type MentionCandidate,
} from "@/lib/attachment-mentions";
import MentionChip from "./MentionChip";
import MentionPreview from "./MentionPreview";

interface Props {
  text: string;
  mentions: MentionCandidate[];
}

export default function MentionedText({ text, mentions }: Props) {
  const [preview, setPreview] = useState<{ token: string; rect: DOMRect } | null>(null);
  const parts = parseMentionTokens(text);
  const candidate = preview ? findCandidateByToken(mentions, preview.token) : undefined;

  if (parts.length === 1 && parts[0].type === "text") {
    return <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{text}</p>;
  }

  return (
    <>
      <p className="text-[15px] whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) =>
          part.type === "token" ? (
            <MentionChip
              key={`${part.value}-${i}`}
              token={part.value}
              candidate={findCandidateByToken(mentions, part.value)}
              interactive
              onPreview={(el, token) => setPreview({ token, rect: el.getBoundingClientRect() })}
              onPreviewEnd={() => setPreview(null)}
            />
          ) : (
            <span key={i}>{part.value}</span>
          )
        )}
      </p>
      {preview && candidate && <MentionPreview candidate={candidate} anchor={preview.rect} />}
    </>
  );
}
