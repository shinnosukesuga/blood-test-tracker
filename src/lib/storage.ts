"use client";

import {
  ItemMaster,
  BloodRecord,
  HealthEvent,
  AppSettings,
  AIConversation,
  AIMessage,
  STORAGE_KEYS,
} from "./types";
import { DEFAULT_ITEMS, EXCLUDED_ITEM_NAMES } from "./itemMaster";

// ============================================================
// Generic helpers
// ============================================================

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ============================================================
// Items (ItemMaster)
// ============================================================

export function loadItems(): ItemMaster[] {
  const saved = load<ItemMaster[]>(STORAGE_KEYS.ITEMS, []);
  const filtered = saved.filter(
    (i) => !EXCLUDED_ITEM_NAMES.has(i.id) && !EXCLUDED_ITEM_NAMES.has(i.name)
  );
  if (filtered.length === 0) {
    save(STORAGE_KEYS.ITEMS, DEFAULT_ITEMS);
    return DEFAULT_ITEMS;
  }
  // 除外項目が含まれていた場合は保存し直す
  if (filtered.length !== saved.length) {
    save(STORAGE_KEYS.ITEMS, filtered);
  }
  // 旧名称マイグレーション
  const migrated = filtered.map((item) => {
    if (item.id === "SBP" && item.name === "高血圧（収縮期）") return { ...item, name: "高血圧" };
    if (item.id === "DBP" && item.name === "低血圧（拡張期）") return { ...item, name: "低血圧" };
    return item;
  });
  const didMigrate = migrated.some((m, i) => m.name !== filtered[i].name);
  if (didMigrate) save(STORAGE_KEYS.ITEMS, migrated);
  return migrated;
}

export function saveItems(items: ItemMaster[]): void {
  save(STORAGE_KEYS.ITEMS, items);
}

export function updateItemOrder(orderedIds: string[]): void {
  const items = loadItems();
  const updated = items.map((item) => ({
    ...item,
    order: orderedIds.indexOf(item.id),
  }));
  saveItems(updated);
}

// DEFAULT_ITEMS の順番を既存アイテムに適用（エイリアス照合で旧IDも統合）
export function resetItemOrder(): ItemMaster[] {
  const saved = loadItems();

  // ID または エイリアス・名前で saved から DEFAULT のエントリを検索
  function findSaved(def: ItemMaster): ItemMaster | undefined {
    // 1. ID直接一致
    const byId = saved.find((s) => s.id === def.id);
    if (byId) return byId;
    // 2. エイリアス・名前で照合（CSVインポートで別IDで入った場合）
    return saved.find(
      (s) =>
        def.aliases.some(
          (a) => a.toLowerCase() === s.id.toLowerCase() || a === s.name
        ) || def.name === s.name
    );
  }

  const matchedSavedIds = new Set<string>();
  const result: ItemMaster[] = DEFAULT_ITEMS.map((def, idx) => {
    const existing = findSaved(def);
    if (existing) matchedSavedIds.add(existing.id);
    return existing
      ? { ...existing, id: def.id, order: idx }  // canonical ID に統一
      : { ...def, order: idx };
  });

  // DEFAULT にない＋マッチしなかった項目を末尾に追加
  let tail = DEFAULT_ITEMS.length;
  for (const item of saved) {
    if (!matchedSavedIds.has(item.id)) {
      result.push({ ...item, order: tail++ });
    }
  }

  saveItems(result);

  // レコードの values キーも旧ID → canonical ID に統一
  const idRemap = new Map<string, string>();
  DEFAULT_ITEMS.forEach((def) => {
    const existing = saved.find(
      (s) => s.id !== def.id && (
        def.aliases.some((a) => a.toLowerCase() === s.id.toLowerCase() || a === s.name) ||
        def.name === s.name
      )
    );
    if (existing) idRemap.set(existing.id, def.id);
  });

  if (idRemap.size > 0) {
    const records = load<BloodRecord[]>(STORAGE_KEYS.RECORDS, []);
    const updated = records.map((r) => ({
      ...r,
      values: Object.fromEntries(
        Object.entries(r.values).map(([k, v]) => [idRemap.get(k) ?? k, v])
      ),
    }));
    save(STORAGE_KEYS.RECORDS, updated);
  }

  return result;
}

// ============================================================
// Records
// ============================================================

export function loadRecords(): BloodRecord[] {
  return load<BloodRecord[]>(STORAGE_KEYS.RECORDS, []).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function saveRecord(record: BloodRecord): void {
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  save(STORAGE_KEYS.RECORDS, records);
}

export function deleteRecord(id: string): void {
  const records = loadRecords().filter((r) => r.id !== id);
  save(STORAGE_KEYS.RECORDS, records);
}

export function getLatestRecord(): BloodRecord | null {
  const records = loadRecords();
  return records[0] ?? null;
}

export function getPreviousRecord(currentDate: string): BloodRecord | null {
  const records = loadRecords();
  const prev = records.find((r) => r.date < currentDate);
  return prev ?? null;
}

// ============================================================
// Events
// ============================================================

export function loadEvents(): HealthEvent[] {
  return load<HealthEvent[]>(STORAGE_KEYS.EVENTS, []);
}

export function saveEvent(event: HealthEvent): void {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    events[idx] = event;
  } else {
    events.push(event);
  }
  save(STORAGE_KEYS.EVENTS, events);
}

export function deleteEvent(id: string): void {
  const events = loadEvents().filter((e) => e.id !== id);
  save(STORAGE_KEYS.EVENTS, events);
}

// ============================================================
// Settings
// ============================================================

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: "",
  defaultView: "list",
  changeHighlight: true,
  changeThreshold: 10,
  aiSeasonalYears: 2,
  aiRecentRecords: 3,
};

export function loadSettings(): AppSettings {
  return load<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
  save(STORAGE_KEYS.SETTINGS, settings);
}

// ============================================================
// AI Conversations
// ============================================================

export function loadAIConversations(): AIConversation[] {
  return load<AIConversation[]>(STORAGE_KEYS.AI_CONVERSATIONS, []);
}

export function loadAIConversation(recordId: string): AIConversation | null {
  const all = loadAIConversations();
  return all.find((c) => c.recordId === recordId) ?? null;
}

export function saveAIMessage(recordId: string, message: AIMessage): void {
  const all = loadAIConversations();
  const idx = all.findIndex((c) => c.recordId === recordId);
  if (idx >= 0) {
    all[idx].messages.push(message);
  } else {
    all.push({ recordId, messages: [message] });
  }
  save(STORAGE_KEYS.AI_CONVERSATIONS, all);
}

export function deleteAIConversation(recordId: string): void {
  const all = loadAIConversations().filter((c) => c.recordId !== recordId);
  save(STORAGE_KEYS.AI_CONVERSATIONS, all);
}

// ============================================================
// Export / Backup
// ============================================================

export function exportJSON(): string {
  return JSON.stringify(
    {
      items: loadItems(),
      records: loadRecords(),
      events: loadEvents(),
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function importJSON(jsonStr: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonStr);
    if (data.items) save(STORAGE_KEYS.ITEMS, data.items);
    if (data.records) save(STORAGE_KEYS.RECORDS, data.records);
    if (data.events) save(STORAGE_KEYS.EVENTS, data.events);
    return { success: true, message: "インポート完了" };
  } catch (e) {
    return { success: false, message: `インポートエラー: ${e}` };
  }
}

// ============================================================
// Helpers
// ============================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
