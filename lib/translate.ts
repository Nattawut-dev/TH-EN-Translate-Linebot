import { buildTranslationInput, buildTranslationPrompt, detectDirection } from "./translatePrompt";
import type { TranslationContext } from "./translationContext";

export const GEMINI_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_TRANSLATION_CHARACTERS = 25000;

export class TranslationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "TranslationError"; }
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}

interface Quantity { raw: string; value: string; sign: string; unit: string | null }

function unitAfter(text: string): string | null {
  const aliases: Array<[RegExp, string]> = [
    [/^(?:mA|Milliampere|มิลลิแอมป์)/iu, "mA"], [/^(?:kWh|Kilowattstunden?|กิโลวัตต์ชั่วโมง)/iu, "kWh"],
    [/^(?:kW|Kilowatt|กิโลวัตต์)(?!h|ชั่วโมง)/iu, "kW"], [/^(?:mm²|mm2|Quadratmillimeter|ตร\.มม\.|ตารางมิลลิเมตร)/iu, "mm²"],
    [/^(?:m²|Quadratmeter|ตารางเมตร)/iu, "m²"], [/^(?:m³|Kubikmeter|ลูกบาศก์เมตร)/iu, "m³"],
    [/^(?:mm|Millimeter|มม\.?|มิลลิเมตร)/iu, "mm"], [/^(?:cm|Zentimeter|ซม\.?|เซนติเมตร)/iu, "cm"],
    [/^(?:Ampere|A|แอมป์)/iu, "A"], [/^(?:Volt|V|โวลต์)/iu, "V"],
    [/^(?:Watt|W|วัตต์)/iu, "W"], [/^(?:Meter|m|เมตร)/iu, "m"],
    [/^(?:bar|บาร์)/iu, "bar"], [/^(?:Euro|EUR|€|ยูโร)/iu, "EUR"],
    [/^(?:THB|Baht|฿|บาท)/iu, "THB"], [/^%/u, "%"],
  ];
  const suffix = text.trimStart();
  for (const [pattern, unit] of aliases) {
    const match = pattern.exec(suffix);
    if (match && (!/[a-z]$/iu.test(match[0]) || !/[a-zäöüß]/iu.test(suffix[match[0].length] ?? ""))) return unit;
  }
  return null;
}

function numericValue(raw: string, german: boolean): string {
  let value = raw.replace(/[๐-๙]/gu, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    .replace(/[+\-−]/gu, "").replace(/[\u00a0\u202f]/gu, "");
  if (value.includes(",") && value.includes(".")) {
    const decimal = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
    value = value.replace(decimal === "," ? /\./gu : /,/gu, "").replace(decimal, ".");
  } else if (value.includes(",")) {
    value = !german && /^\d{1,3}(?:,\d{3})+$/u.test(value) ? value.replace(/,/gu, "") : value.replace(",", ".");
  } else if (german && /^\d{1,3}(?:\.\d{3})+$/u.test(value)) {
    value = value.replace(/\./gu, "");
  }
  const [integer, fraction = ""] = value.split(".");
  const whole = integer.replace(/^0+(?=\d)/u, "");
  const decimal = fraction.replace(/0+$/u, "");
  return decimal ? `${whole}.${decimal}` : whole;
}

function quantities(text: string, german: boolean): Quantity[] {
  const rows = [...text.matchAll(/[+\-−]?[0-9๐-๙]+(?:(?:[.,][0-9๐-๙]+)|(?:[\u00a0\u202f][0-9๐-๙]{3}))*/gu)].map((match) => ({
    raw: match[0].replace(/−/gu, "-"), value: numericValue(match[0], german),
    sign: /^[+\-−]/u.test(match[0]) ? match[0][0].replace(/−/gu, "-") : "",
    unit: unitAfter(text.slice(match.index! + match[0].length)) ?? (/((?:Euro|EUR|€))\s*$/iu.test(text.slice(0, match.index)) ? "EUR" : /(?:THB|Baht|฿|บาท)\s*$/iu.test(text.slice(0, match.index)) ? "THB" : null),
  }));
  const laughter = /ฮา|ขำ|ตลก|haha|lol|lustig|witzig/iu.test(text);
  const price = /ราคา|บาท|จำนวน|ยอด|ทั้งหมด|Euro|Baht|THB|EUR|Preis|price|cost/iu.test(text);
  return laughter && !price && rows.every((row) => !row.unit) ? rows.filter((row) => !/^5{3,}$/u.test(row.raw)) : rows;
}

function sameQuantities(source: Quantity[], output: Quantity[], includeUnit: boolean): boolean {
  const remaining = [...output];
  for (const quantity of source) {
    const index = remaining.findIndex((candidate) =>
      candidate.sign === quantity.sign &&
      (candidate.raw === quantity.raw || candidate.value === quantity.value) &&
      (!includeUnit || candidate.unit === quantity.unit));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

export function extractTranslation(data: GeminiResponse, original: string): string {
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new TranslationError("incomplete_response");
  const text = candidate.content?.parts?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text).join("").trim();
  if (!text || [...text].length > MAX_TRANSLATION_CHARACTERS) throw new TranslationError("invalid_output");
  const sourceGerman = detectDirection(original) === "DE_TO_TH";
  const source = quantities(original, sourceGerman);
  const output = quantities(text, !sourceGerman);
  if (!sameQuantities(source, output, false)) throw new TranslationError("changed_numbers");
  if (!sameQuantities(source, output, true)) throw new TranslationError("changed_units");
  const label = /^(?:คำแปล|Translation|Übersetzung|Here is|หมายเหตุ|คำถามจากบอต|Rückfrage)\s*[:：]/iu;
  if (label.test(text) && !label.test(original.trim())) {
    throw new TranslationError("unexpected_explanation");
  }
  return text;
}

export async function translateMessage(text: string, context?: TranslationContext): Promise<string> {
  // Numbers without a stated unit are language-neutral; never guess a unit or price.
  if (/^[\p{N}\s.,:+\-/%²³×=()]+$/u.test(text.trim())) return text;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TranslationError("missing_api_key");
  const { systemPrompt } = buildTranslationPrompt(text);
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: buildTranslationInput(text, context) }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch { throw new TranslationError("request_failed"); }
    if (!response.ok) {
      if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
        const retryAfter = response.headers.get("retry-after");
        if (!retryAfter || retryAfter === "0") continue;
      }
      throw new TranslationError(`http_${response.status}`);
    }
    let data: GeminiResponse;
    try { data = await response.json(); } catch { throw new TranslationError("invalid_response"); }
    try { return extractTranslation(data, text); }
    catch (error) {
      // One bounded retry can repair a malformed translation. Never send model commentary.
      if (attempt === 0 && error instanceof TranslationError && ["changed_numbers", "changed_units", "unexpected_explanation"].includes(error.code)) continue;
      throw error;
    }
  }
  throw new TranslationError("translation_failed");
}
