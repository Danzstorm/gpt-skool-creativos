/**
 * Si el modelo envuelve TODO el mensaje en un único fence markdown
 * (` ``` ` … ` ``` `), el cuerpo real es el interior. Si no, se deja igual.
 */
export function unwrapPromptFence(content: string): string {
  const trimmed = content.trim();
  const match = /^```[^\n]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return match ? match[1] : content;
}
