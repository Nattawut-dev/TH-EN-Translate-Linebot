export function shouldTranslate(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length < 2) return false;               // สั้นเกินไป เช่น "ok", "5"
  if (trimmed.startsWith("/")) return false;            // เป็นคำสั่ง เช่น /translate
  if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return false;    // เป็น emoji ล้วน

  return true;
}
