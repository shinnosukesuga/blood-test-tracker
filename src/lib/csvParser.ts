import { BloodRecord, ItemMaster } from "./types";
import { generateId } from "./storage";
import { EXCLUDED_ITEM_NAMES } from "./itemMaster";

// ============================================================
// CSV インポート（血液検査グラフアプリ形式）
// 列: 年,月,日,項目名称,項目略称,値,単位,正常値下限,正常値上限
// ============================================================

interface CsvRow {
  year: string;
  month: string;
  day: string;
  name: string;
  alias: string;
  value: string;
  unit: string;
  rangeMin: string;
  rangeMax: string;
}

const MAX_FIELD_LEN = 100;
const SAFE_TEXT = /^[\w\s\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F\u4E00-\u9FFF\-\/().%*+]+$/;

function sanitizeTextField(s: string): string {
  const trimmed = s.slice(0, MAX_FIELD_LEN).trim();
  // 危険な文字（スクリプト注入等）を除去
  return trimmed.replace(/[<>"'`]/g, "");
}

function parseRow(line: string): CsvRow | null {
  // CSV の各フィールドをダブルクォート対応でパース
  const fields: string[] = [];
  let inQuote = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);

  if (fields.length < 9) return null;

  const name = sanitizeTextField(fields[3]);
  const alias = sanitizeTextField(fields[4]);
  const unit = sanitizeTextField(fields[6]);

  // 名前・略称は必須かつ安全な文字のみ許可
  if (!name || name.length === 0) return null;

  return {
    year: fields[0].trim().slice(0, 4),
    month: fields[1].trim().slice(0, 2),
    day: fields[2].trim().slice(0, 2),
    name,
    alias,
    value: fields[5].trim().slice(0, 20),
    unit,
    rangeMin: fields[7].trim().slice(0, 20),
    rangeMax: fields[8].trim().slice(0, 20),
  };
}

export interface ImportResult {
  records: BloodRecord[];
  itemUpdates: Array<{
    id: string;
    name: string;
    alias: string;
    csvOrder: number;  // CSV内での初出順
    unit: string;
    rangeMin: number | null;
    rangeMax: number | null;
  }>;
  errors: string[];
}

export function parseCSV(csvText: string): ImportResult {
  // BOM除去・CRLF正規化
  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim());
  const errors: string[] = [];

  // ヘッダー行をスキップ（"年" で始まる行）
  const dataLines = lines.filter((l) => !l.match(/^["']?年/));

  // ── パス1: 日付ごとにグループ化（行の登場順を維持） ──
  const byDate: Map<string, CsvRow[]> = new Map();
  for (const line of dataLines) {
    const row = parseRow(line);
    if (!row || !row.year || isNaN(Number(row.value))) continue;
    if (EXCLUDED_ITEM_NAMES.has(row.name) || EXCLUDED_ITEM_NAMES.has(row.alias)) continue;
    const month = row.month.padStart(2, "0");
    const day = row.day.padStart(2, "0");
    const date = `${row.year}-${month}-${day}`;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  // ── パス2: 最新日付優先でアイテム順を確定 ──
  // 最新日→古い日の順で走査し、各日付内の登場順を csvOrder に割り当てる
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  const itemMap = new Map<
    string,
    { name: string; alias: string; unit: string; rangeMin: number | null; rangeMax: number | null; csvOrder: number }
  >();
  let itemOrderCounter = 0;

  for (const date of sortedDates) {
    for (const row of byDate.get(date)!) {
      const itemId = row.alias || row.name;
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, {
          name: row.name,
          alias: row.alias,
          unit: row.unit,
          rangeMin: row.rangeMin ? parseFloat(row.rangeMin) : null,
          rangeMax: row.rangeMax ? parseFloat(row.rangeMax) : null,
          csvOrder: itemOrderCounter++,
        });
      }
    }
  }

  const records: BloodRecord[] = [];

  for (const [date, rows] of byDate.entries()) {
    const values: Record<string, number> = {};
    for (const row of rows) {
      const itemId = row.alias || row.name;
      const val = parseFloat(row.value);
      if (isNaN(val)) continue;
      values[itemId] = val;
    }
    if (Object.keys(values).length > 0) {
      records.push({
        id: generateId(),
        date,
        values,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 日付でソート（新しい順）
  records.sort((a, b) => b.date.localeCompare(a.date));

  const itemUpdates = Array.from(itemMap.entries()).map(([id, info]) => ({
    id,
    ...info,
  }));

  return { records, itemUpdates, errors };
}

// ============================================================
// CSV エクスポート（血液検査グラフアプリ互換形式）
// ============================================================

export function exportToCSV(records: BloodRecord[], items: ItemMaster[]): string {
  const rows: string[] = [];
  rows.push("年,月,日,項目名称,項目略称,値,単位,正常値,正常値");

  const itemMap = new Map(items.map((i) => [i.id, i]));

  for (const record of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    const [year, month, day] = record.date.split("-");
    for (const [itemId, value] of Object.entries(record.values)) {
      const item = itemMap.get(itemId);
      const name = item?.name ?? itemId;
      const alias = item?.aliases[1] ?? "";
      const unit = item?.unit ?? "";
      const rangeMin = item?.range.min ?? "";
      const rangeMax = item?.range.max ?? "";
      rows.push(
        `"${year}","${month}","${day}","${name}","${alias}","${value}","${unit}","${rangeMin}","${rangeMax}"`
      );
    }
  }

  return rows.join("\n");
}

// ============================================================
// ダウンロードヘルパー
// ============================================================

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
