"use client";

import {
  doc, getDoc, setDoc, collection, getDocs,
  deleteDoc, query, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ItemMaster, BloodRecord, HealthEvent, AppSettings,
  AIConversation, AIMessage, STORAGE_KEYS,
} from "./types";
import { DEFAULT_ITEMS, EXCLUDED_ITEM_NAMES } from "./itemMaster";

// ============================================================
// Firestore path helpers
// ============================================================

function metaRef(uid: string, key: string) {
  return doc(db, "users", uid, "meta", key);
}
function recordsCol(uid: string) {
  return collection(db, "users", uid, "records");
}
function eventsCol(uid: string) {
  return collection(db, "users", uid, "events");
}

// ============================================================
// Items
// ============================================================

export async function loadItems(uid: string): Promise<ItemMaster[]> {
  const snap = await getDoc(metaRef(uid, "items"));
  if (!snap.exists()) return DEFAULT_ITEMS;
  const items = (snap.data().items as ItemMaster[]) ?? DEFAULT_ITEMS;
  const filtered = items.filter(
    (i) => !EXCLUDED_ITEM_NAMES.has(i.id) && !EXCLUDED_ITEM_NAMES.has(i.name)
  );
  if (filtered.length === 0) return DEFAULT_ITEMS;
  // 旧名称マイグレーション
  return filtered.map((item) => {
    if (item.id === "SBP" && item.name === "高血圧（収縮期）") return { ...item, name: "高血圧" };
    if (item.id === "DBP" && item.name === "低血圧（拡張期）") return { ...item, name: "低血圧" };
    return item;
  });
}

export async function saveItems(uid: string, items: ItemMaster[]): Promise<void> {
  await setDoc(metaRef(uid, "items"), { items });
}

export async function resetItemOrder(uid: string): Promise<ItemMaster[]> {
  const saved = await loadItems(uid);

  function findSaved(def: ItemMaster): ItemMaster | undefined {
    const byId = saved.find((s) => s.id === def.id);
    if (byId) return byId;
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
      ? { ...existing, id: def.id, order: idx }
      : { ...def, order: idx };
  });

  let tail = DEFAULT_ITEMS.length;
  for (const item of saved) {
    if (!matchedSavedIds.has(item.id)) {
      result.push({ ...item, order: tail++ });
    }
  }

  await saveItems(uid, result);

  // レコードの values キーも canonical ID に統一
  const idRemap = new Map<string, string>();
  DEFAULT_ITEMS.forEach((def) => {
    const existing = saved.find(
      (s) =>
        s.id !== def.id &&
        (def.aliases.some(
          (a) => a.toLowerCase() === s.id.toLowerCase() || a === s.name
        ) ||
          def.name === s.name)
    );
    if (existing) idRemap.set(existing.id, def.id);
  });

  if (idRemap.size > 0) {
    const records = await loadRecords(uid);
    await Promise.all(
      records.map((r) =>
        saveRecord(uid, {
          ...r,
          values: Object.fromEntries(
            Object.entries(r.values).map(([k, v]) => [idRemap.get(k) ?? k, v])
          ),
        })
      )
    );
  }

  return result;
}

// ============================================================
// Records
// ============================================================

export async function loadRecords(uid: string): Promise<BloodRecord[]> {
  const snap = await getDocs(query(recordsCol(uid), orderBy("date", "desc")));
  return snap.docs.map((d) => d.data() as BloodRecord);
}

export async function saveRecord(uid: string, record: BloodRecord): Promise<void> {
  await setDoc(doc(db, "users", uid, "records", record.id), record);
}

export async function deleteRecord(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "records", id));
  await deleteAIConversation(uid, id);
}

export async function getPreviousRecord(
  uid: string,
  currentDate: string
): Promise<BloodRecord | null> {
  const records = await loadRecords(uid);
  return records.find((r) => r.date < currentDate) ?? null;
}

// ============================================================
// Events
// ============================================================

export async function loadEvents(uid: string): Promise<HealthEvent[]> {
  const snap = await getDocs(eventsCol(uid));
  return snap.docs.map((d) => d.data() as HealthEvent);
}

export async function saveEvent(uid: string, event: HealthEvent): Promise<void> {
  await setDoc(doc(db, "users", uid, "events", event.id), event);
}

export async function deleteEvent(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "events", id));
}

// ============================================================
// Settings
// ============================================================

const DEFAULT_SETTINGS: AppSettings = {
  defaultView: "list",
  changeHighlight: true,
  changeThreshold: 10,
  aiSeasonalYears: 2,
  aiRecentRecords: 3,
};

export async function loadSettings(uid: string): Promise<AppSettings> {
  const snap = await getDoc(metaRef(uid, "settings"));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(snap.data() as AppSettings) };
}

export async function saveSettings(uid: string, settings: AppSettings): Promise<void> {
  await setDoc(metaRef(uid, "settings"), settings);
}

// ============================================================
// AI Conversations
// ============================================================

export async function loadAIConversation(
  uid: string,
  recordId: string
): Promise<AIConversation | null> {
  const snap = await getDoc(doc(db, "users", uid, "aiConversations", recordId));
  if (!snap.exists()) return null;
  return snap.data() as AIConversation;
}

export async function saveAIMessage(
  uid: string,
  recordId: string,
  message: AIMessage
): Promise<void> {
  const ref = doc(db, "users", uid, "aiConversations", recordId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as AIConversation;
    await setDoc(ref, { ...data, messages: [...data.messages, message] });
  } else {
    await setDoc(ref, { recordId, messages: [message] });
  }
}

export async function deleteAIConversation(uid: string, recordId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "aiConversations", recordId));
}

// ============================================================
// Export / Import
// ============================================================

export async function exportJSON(uid: string): Promise<string> {
  const [items, records, events] = await Promise.all([
    loadItems(uid),
    loadRecords(uid),
    loadEvents(uid),
  ]);
  return JSON.stringify(
    { items, records, events, exportedAt: new Date().toISOString() },
    null,
    2
  );
}

export async function importJSON(
  uid: string,
  jsonStr: string
): Promise<{ success: boolean; message: string }> {
  try {
    const data = JSON.parse(jsonStr) as {
      items?: ItemMaster[];
      records?: BloodRecord[];
      events?: HealthEvent[];
    };
    const promises: Promise<void>[] = [];
    if (Array.isArray(data.items)) {
      promises.push(saveItems(uid, data.items));
    }
    if (Array.isArray(data.records)) {
      for (const r of data.records) promises.push(saveRecord(uid, r));
    }
    if (Array.isArray(data.events)) {
      for (const e of data.events) promises.push(saveEvent(uid, e));
    }
    await Promise.all(promises);
    return { success: true, message: "インポート完了" };
  } catch (e) {
    return { success: false, message: `インポートエラー: ${e}` };
  }
}

// ============================================================
// Migration from localStorage（初回ログイン時のみ実行）
// ============================================================

export async function migrateFromLocalStorage(uid: string): Promise<void> {
  if (typeof window === "undefined") return;

  // Firestoreにデータがある場合はスキップ
  const snap = await getDoc(metaRef(uid, "items"));
  if (snap.exists()) return;

  const promises: Promise<void>[] = [];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ITEMS);
    if (raw) {
      const items = JSON.parse(raw) as ItemMaster[];
      if (items.length > 0) promises.push(saveItems(uid, items));
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (raw) {
      const records = JSON.parse(raw) as BloodRecord[];
      for (const r of records) promises.push(saveRecord(uid, r));
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (raw) {
      const events = JSON.parse(raw) as HealthEvent[];
      for (const e of events) promises.push(saveEvent(uid, e));
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const settings = JSON.parse(raw) as AppSettings;
      promises.push(saveSettings(uid, settings));
    }
  } catch { /* ignore */ }

  if (promises.length > 0) await Promise.all(promises);
}

// ============================================================
// Helpers
// ============================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
