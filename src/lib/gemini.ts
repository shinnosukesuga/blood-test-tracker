import { GeminiScanResult, AIAnalysis, AIMessage, BloodRecord, ItemMaster } from "./types";

// ============================================================
// 画像スキャン
// ============================================================

export async function scanImageWithGemini(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<GeminiScanResult> {
  const res = await fetch("/api/gemini/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "スキャンに失敗しました");
  }
  return res.json();
}

// ============================================================
// AI 分析（前回比較）
// ============================================================

export async function analyzeRecords(
  currentRecord: BloodRecord,
  previousRecord: BloodRecord | null,
  items: ItemMaster[]
): Promise<AIAnalysis> {
  const res = await fetch("/api/gemini/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentRecord, previousRecord, items }),
  });
  if (!res.ok) {
    throw new Error("AI分析に失敗しました");
  }
  return res.json();
}

// ============================================================
// AI チャット（季節コンテキスト + 会話履歴）
// ============================================================

export async function analyzeWithContext(
  currentRecord: BloodRecord,
  recentRecords: BloodRecord[],
  allRecords: BloodRecord[],
  items: ItemMaster[],
  conversationHistory: AIMessage[],
  userMessage: string | null,
  seasonalYears: number = 2
): Promise<string> {
  const res = await fetch("/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentRecord,
      recentRecords,
      allRecords,
      items,
      conversationHistory,
      userMessage,
      seasonalYears,
    }),
  });
  if (!res.ok) {
    throw new Error("AI分析に失敗しました");
  }
  const data = await res.json();
  return data.text;
}

// ============================================================
// Helpers
// ============================================================

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.85;

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像の読み込みに失敗しました")); };
    img.src = url;
  });
}
