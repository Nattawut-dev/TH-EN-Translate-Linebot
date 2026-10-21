export function shouldTranslate(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return false;
  // Emoji includes digits in Unicode. A numeric reply must not be discarded as emoji.
  if (!/\p{N}/u.test(trimmed) && /^[\p{Emoji}\p{Emoji_Component}\s]+$/u.test(trimmed)) return false;
  return true;
}
