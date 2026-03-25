// ============================================================
// BloodTrack - Core Type Definitions
// ============================================================

export interface ItemRange {
  min: number | null;
  max: number | null;
}

export interface ItemMaster {
  id: string;           // 主キー（略称ベース）e.g. "AST"
  name: string;         // 表示名 e.g. "GOT"
  aliases: string[];    // 別名・略称 e.g. ["AST", "GOT"]
  unit: string;         // 単位 e.g. "U/L"
  range: ItemRange;     // 基準値
  order: number;        // 表示順（D&D で変更可）
  visible: boolean;     // 一覧に表示するか
}

export interface BloodRecord {
  id: string;
  date: string;         // "YYYY-MM-DD"
  values: Record<string, number>;
  note?: string;
  createdAt: string;    // ISO timestamp
}

export interface HealthEvent {
  id: string;
  date: string;         // "YYYY-MM-DD"
  label: string;
}

export interface AppSettings {
  defaultView: "list" | "grid";
  changeHighlight: boolean;   // 前回比の色強調を有効にする
  changeThreshold: number;    // 色強調する変化率の閾値（%）
  aiSeasonalYears: number;    // AI分析: 季節コンテキストとして参照する過去年数
  aiRecentRecords: number;    // AI分析: 直近参照レコード件数
}

// Gemini API レスポンス
export interface GeminiScanResult {
  items: Array<{
    name: string;
    alias?: string;
    value: number;
    unit?: string;
    rangeMin?: number;
    rangeMax?: number;
  }>;
  date?: string;
  rawText: string;
}

export interface AIAnalysis {
  summary: string;
  insights: string[];
  recommendations: string[];
  hasSignificantChanges: boolean;
}

// AI チャット
export interface AIMessage {
  role: "ai" | "user";
  content: string;
  createdAt: string;
}

export interface AIConversation {
  recordId: string;
  messages: AIMessage[];
}

// ストレージキー定数
export const STORAGE_KEYS = {
  ITEMS: "bloodtrack_items",
  RECORDS: "bloodtrack_records",
  EVENTS: "bloodtrack_events",
  SETTINGS: "bloodtrack_settings",
  ITEM_ORDER: "bloodtrack_item_order",
  AI_CONVERSATIONS: "bloodtrack_ai_conversations",
} as const;
