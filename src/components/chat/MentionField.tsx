"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { parseMentionTokens } from "@/lib/attachment-mentions";

export interface MentionFieldHandle {
  focus: () => void;
  getCaret: () => number;
  getValue: () => string;
  apply: (text: string, caret: number) => void;
  getElement: () => HTMLDivElement | null;
}

interface Props {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onCaret: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onTokenPreview: (el: HTMLElement, token: string) => void;
  onTokenPreviewEnd: () => void;
}

function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.mention) {
      out += node.dataset.mention;
      return;
    }
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    if (node.tagName === "DIV" && node !== root) {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  if (out === "\n") return "";
  return out;
}

function serializedCaret(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return serialize(root).length;
  }
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  const probe = document.createElement("div");
  probe.appendChild(range.cloneContents());
  return serialize(probe).length;
}

function placeCaret(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = Math.max(0, offset);
  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.collapse(false);

  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node instanceof HTMLElement && node.dataset.mention) {
      const len = node.dataset.mention.length;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      if (remaining <= 1) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  };

  if (!visit(root)) {
    sel.removeAllRanges();
    sel.addRange(endRange);
  }
}

function tokenSpan(
  token: string,
  onPreview: (el: HTMLElement, token: string) => void,
  onPreviewEnd: () => void
): HTMLSpanElement {
  const span = document.createElement("span");
  span.dataset.mention = token;
  span.contentEditable = "false";
  span.tabIndex = 0;
  span.className = "mention-chip";
  span.textContent = token;
  span.addEventListener("mouseenter", () => onPreview(span, token));
  span.addEventListener("focus", () => onPreview(span, token));
  span.addEventListener("mouseleave", onPreviewEnd);
  span.addEventListener("blur", onPreviewEnd);
  return span;
}

function nodesFromText(
  text: string,
  onPreview: (el: HTMLElement, token: string) => void,
  onPreviewEnd: () => void
): Node[] {
  if (!text) return [];
  const nodes: Node[] = [];
  const parts = parseMentionTokens(text);
  const pushText = (value: string) => {
    const lines = value.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) nodes.push(document.createElement("br"));
      if (line) nodes.push(document.createTextNode(line));
    });
  };
  for (const part of parts) {
    if (part.type === "token") nodes.push(tokenSpan(part.value, onPreview, onPreviewEnd));
    else pushText(part.value);
  }
  return nodes;
}

const MentionField = forwardRef<MentionFieldHandle, Props>(function MentionField(
  {
    value,
    disabled,
    placeholder,
    onChange,
    onCaret,
    onKeyDown,
    onPaste,
    onTokenPreview,
    onTokenPreviewEnd,
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const previewRef = useRef(onTokenPreview);
  const previewEndRef = useRef(onTokenPreviewEnd);
  previewRef.current = onTokenPreview;
  previewEndRef.current = onTokenPreviewEnd;

  const rebuild = useCallback((text: string) => {
    const root = rootRef.current;
    if (!root) return;
    root.replaceChildren(
      ...nodesFromText(
        text,
        (el, token) => previewRef.current(el, token),
        () => previewEndRef.current()
      )
    );
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (serialize(root) === value) return;
    rebuild(value);
    if (pendingCaret.current !== null) {
      placeCaret(root, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value, rebuild]);

  useImperativeHandle(ref, () => ({
    focus() {
      rootRef.current?.focus();
    },
    getCaret() {
      return rootRef.current ? serializedCaret(rootRef.current) : 0;
    },
    getValue() {
      return rootRef.current ? serialize(rootRef.current) : "";
    },
    apply(text: string, caret: number) {
      pendingCaret.current = caret;
      const root = rootRef.current;
      if (root) {
        rebuild(text);
        placeCaret(root, caret);
        pendingCaret.current = null;
      }
    },
    getElement() {
      return rootRef.current;
    },
  }));

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-multiline="true"
      aria-label="Mensaje"
      aria-placeholder={placeholder}
      contentEditable={!disabled}
      data-placeholder={placeholder}
      data-empty={value.trim() === "" ? "true" : "false"}
      suppressContentEditableWarning
      onInput={() => {
        const root = rootRef.current;
        if (!root) return;
        onChange(serialize(root));
        onCaret();
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onClick={onCaret}
      onKeyUp={onCaret}
      onSelect={onCaret}
      className="mention-field flex-1 bg-transparent text-ink placeholder:text-zinc-500 focus:outline-none text-[16px] leading-6 py-2 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words"
    />
  );
});

export default MentionField;
