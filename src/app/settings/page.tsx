"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "framer-motion";
import { ChevronLeft, Save, Trash2, Plus, X, GripVertical, FileDown, FileUp, Pencil } from "lucide-react";
import { loadSettings, saveSettings, importJSON, loadItems, saveItems, loadRecords, generateId, resetItemOrder, exportJSON } from "@/lib/storage";
import { exportToCSV, parseCSV, downloadFile } from "@/lib/csvParser";
import { AppSettings, ItemMaster, ItemCategory } from "@/lib/types";
import { sanitizeNum } from "@/lib/utils";

const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: "liver",          label: "肝機能" },
  { value: "kidney",         label: "腎機能" },
  { value: "metabolic",      label: "代謝系" },
  { value: "inflammation",   label: "炎症" },
  { value: "cardiovascular", label: "血圧" },
  { value: "blood",          label: "血液" },
  { value: "differential",   label: "白血球分画" },
  { value: "other",          label: "その他" },
];

const EMPTY_NEW_ITEM = {
  name: "", id: "", unit: "", rangeMin: "", rangeMax: "",
  category: "other" as ItemCategory,
};

interface SortableItemRowProps {
  item: ItemMaster;
  editingId: string | null;
  editValues: { rangeMin: string; rangeMax: string; unit: string };
  reorderMode: boolean;
  onStartEdit: (item: ItemMaster) => void;
  onSaveEdit: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onEditValuesChange: (v: { rangeMin: string; rangeMax: string; unit: string }) => void;
}

function SortableItemRow({
  item, editingId, editValues, reorderMode,
  onStartEdit, onSaveEdit, onToggleVisibility, onEditValuesChange,
}: SortableItemRowProps) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      key={item.id}
      value={item}
      dragListener={false}
      dragControls={controls}
      style={{ listStyle: "none" }}
      className="bg-white"
    >
      {/* 行ヘッダー */}
      <div className="flex items-center px-3 py-2.5 gap-2">
        {/* グリップ（並び替えモード時のみ有効） */}
        <div
          className={`shrink-0 touch-none ${reorderMode ? "text-gray-400 cursor-grab active:cursor-grabbing" : "text-gray-200 cursor-default"}`}
          onPointerDown={reorderMode ? (e) => controls.start(e) : undefined}
        >
          <GripVertical size={16} />
        </div>

        {/* 項目名・略称・基準値・単位 */}
        <div className="flex-1 min-w-0">
          {/* 上段: 項目名 + 基準値 */}
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
            <span className="text-xs text-gray-500 shrink-0 tabular-nums">
              {item.range.min !== null || item.range.max !== null
                ? `${item.range.min ?? ""}〜${item.range.max ?? ""}`
                : "—"}
            </span>
          </div>
          {/* 下段: 略称(グレー) + 単位 */}
          <div className="flex items-baseline justify-between gap-1 mt-0.5">
            {(() => {
              const isAscii = (s: string) => !/[\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F]/.test(s) && s !== item.name;
              const abbr = item.aliases.filter(isAscii).sort((a, b) => a.length - b.length)[0];
              return <span className="text-[11px] text-gray-400">{abbr ?? ""}</span>;
            })()}
            <span className="text-[11px] text-gray-400 shrink-0">{item.unit}</span>
          </div>
        </div>

        {/* 編集ボタン */}
        <button
          onClick={() => onStartEdit(item)}
          className={`p-1.5 rounded-lg border shrink-0 transition ${
            editingId === item.id
              ? "bg-red-50 border-red-300 text-red-500"
              : "bg-gray-50 border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500"
          }`}
        >
          <Pencil size={13} />
        </button>

        {/* 表示トグル */}
        <button
          onClick={() => onToggleVisibility(item.id)}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
            item.visible ? "bg-red-500" : "bg-gray-200"
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              item.visible ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* 編集フォーム（展開） */}
      {editingId === item.id && (
        <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">単位</label>
              <input
                type="text"
                value={editValues.unit}
                onChange={(e) => onEditValuesChange({ ...editValues, unit: e.target.value })}
                className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">基準値 下限</label>
              <input
                type="text"
                inputMode="numeric"
                value={editValues.rangeMin}
                onChange={(e) => onEditValuesChange({ ...editValues, rangeMin: sanitizeNum(e.target.value) })}
                placeholder="—"
                className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">基準値 上限</label>
              <input
                type="text"
                inputMode="numeric"
                value={editValues.rangeMax}
                onChange={(e) => onEditValuesChange({ ...editValues, rangeMax: sanitizeNum(e.target.value) })}
                placeholder="—"
                className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
              />
            </div>
          </div>
          <button
            onClick={() => onSaveEdit(item.id)}
            className="w-full py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            保存
          </button>
        </div>
      )}
    </Reorder.Item>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>({ defaultView: "list", changeHighlight: true, changeThreshold: 10, aiSeasonalYears: 2, aiRecentRecords: 3 });
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [origOrder, setOrigOrder] = useState<string[]>([]);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_NEW_ITEM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ rangeMin: string; rangeMax: string; unit: string }>({
    rangeMin: "", rangeMax: "", unit: "",
  });
  const [reorderMode, setReorderMode] = useState(false);
  const [showDataHelp, setShowDataHelp] = useState(false);
  const dataHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    const loaded = loadItems();
    setItems(loaded);
    setOrigOrder(loaded.map(i => i.id));
  }, []);

  const isOrderChanged = () => {
    const current = items.map(i => i.id);
    return current.some((id, idx) => id !== origOrder[idx]);
  };

  const handleBack = () => {
    if (isOrderChanged()) {
      setShowBackConfirm(true);
    } else {
      router.push("/");
    }
  };

  const handleBackKeep = () => {
    setShowBackConfirm(false);
    router.push("/");
  };

  const handleBackRestore = () => {
    const restored = [...items].sort((a, b) => origOrder.indexOf(a.id) - origOrder.indexOf(b.id))
      .map((item, idx) => ({ ...item, order: idx }));
    saveItems(restored);
    setShowBackConfirm(false);
    router.push("/");
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleJSONImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importJSON(text);
    setImportMsg(result.message);
    if (result.success) setItems(loadItems());
    e.target.value = "";
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseCSV(text);
      const currentItems = loadItems();
      const itemsById = new Map(currentItems.map((i) => [i.id, i]));
      const maxOrder = currentItems.reduce((m, i) => Math.max(m, i.order), -1);
      let nextOrder = maxOrder + 1;
      const csvIdToCanonicalId = new Map<string, string>();
      for (const upd of result.itemUpdates) {
        const csvId = upd.id;
        if (itemsById.has(csvId)) { csvIdToCanonicalId.set(csvId, csvId); continue; }
        let matched: string | null = null;
        for (const item of itemsById.values()) {
          if (item.name === upd.name || item.aliases.some((a) => a.toLowerCase() === csvId.toLowerCase() || a === upd.name)) {
            matched = item.id; break;
          }
        }
        if (matched) {
          csvIdToCanonicalId.set(csvId, matched);
        } else {
          itemsById.set(csvId, { id: csvId, name: upd.name, aliases: upd.alias ? [upd.alias, upd.name] : [upd.name], unit: upd.unit, range: { min: upd.rangeMin, max: upd.rangeMax }, category: "other", order: nextOrder++, visible: true });
          csvIdToCanonicalId.set(csvId, csvId);
        }
      }
      const updatedItems = Array.from(itemsById.values()).sort((a, b) => a.order - b.order);
      saveItems(updatedItems);
      setItems(updatedItems);
      const { saveRecord, loadRecords: lr } = await import("@/lib/storage");
      const existing = lr();
      const existingDates = new Set(existing.map((r) => r.date));
      const newRecords = result.records.filter((r) => !existingDates.has(r.date)).map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([id, val]) => [csvIdToCanonicalId.get(id) ?? id, val])) }));
      for (const r of newRecords) saveRecord(r);
      const skipped = result.records.length - newRecords.length;
      setImportMsg(`インポート完了: ${newRecords.length}件追加・${skipped}件重複スキップ（CSV解析: ${result.records.length}件）`);
    } catch (err) {
      setImportMsg(`エラー: ${err}`);
    }
    e.target.value = "";
  };

  const handleCSVExport = () => {
    const records = loadRecords();
    const csv = exportToCSV(records, items);
    const now = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `bloodtrack_${now}.csv`, "text/csv;charset=utf-8");
  };

  const handleJSONExport = () => {
    const json = exportJSON();
    const now = new Date().toISOString().slice(0, 10);
    downloadFile(json, `bloodtrack_backup_${now}.json`, "application/json");
  };

  const handleResetOrder = () => {
    const updated = resetItemOrder();
    setItems(updated);
    setImportMsg("並び順をデフォルトにリセットしました");
  };

  const handleClearData = () => {
    if (!confirm("すべてのデータを削除しますか？この操作は元に戻せません。")) return;
    ["bloodtrack_items", "bloodtrack_records", "bloodtrack_events"].forEach((k) =>
      localStorage.removeItem(k)
    );
    setImportMsg("データを削除しました");
    setItems([]);
  };

  const handleReorder = (reordered: ItemMaster[]) => {
    const updated = reordered.map((item, idx) => ({ ...item, order: idx }));
    setItems(updated);
    saveItems(updated);
  };

  const toggleItemVisibility = (id: string) => {
    const updated = items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i));
    setItems(updated);
    saveItems(updated);
  };

  const startEdit = (item: ItemMaster) => {
    if (editingId === item.id) {
      setEditingId(null);
      return;
    }
    setEditingId(item.id);
    setEditValues({
      rangeMin: item.range.min !== null ? String(item.range.min) : "",
      rangeMax: item.range.max !== null ? String(item.range.max) : "",
      unit: item.unit,
    });
  };

  const saveEdit = (id: string) => {
    const updated = items.map((i) =>
      i.id === id
        ? {
            ...i,
            unit: editValues.unit,
            range: {
              min: editValues.rangeMin !== "" ? parseFloat(editValues.rangeMin) : null,
              max: editValues.rangeMax !== "" ? parseFloat(editValues.rangeMax) : null,
            },
          }
        : i
    );
    setItems(updated);
    saveItems(updated);
    setEditingId(null);
    setImportMsg("基準値を更新しました");
  };

  const handleAddItem = () => {
    const id = newItem.id.trim() || newItem.name.trim();
    if (!id || !newItem.name.trim()) return;
    if (items.find((i) => i.id === id)) {
      setImportMsg(`ID「${id}」はすでに存在します`);
      return;
    }
    const item: ItemMaster = {
      id,
      name: newItem.name.trim(),
      aliases: [newItem.name.trim(), newItem.id.trim()].filter(Boolean),
      unit: newItem.unit.trim(),
      range: {
        min: newItem.rangeMin !== "" ? parseFloat(newItem.rangeMin) : null,
        max: newItem.rangeMax !== "" ? parseFloat(newItem.rangeMax) : null,
      },
      category: newItem.category,
      order: items.length,
      visible: true,
    };
    const updated = [...items, item];
    saveItems(updated);
    setItems(updated);
    setNewItem(EMPTY_NEW_ITEM);
    setShowAddForm(false);
    setImportMsg(`「${item.name}」を追加しました`);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold">設定</h1>
        </div>
      </header>

      {/* 並び順変更確認バー */}
      {showBackConfirm && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 sticky top-[56px] z-10">
          <p className="text-sm font-medium text-yellow-800 mb-2">項目の並び順が変更されています</p>
          <div className="flex gap-2">
            <button
              onClick={handleBackKeep}
              className="flex-1 py-2 bg-yellow-600 text-white rounded-xl text-xs font-bold"
            >
              このまま戻る（並び順を保存）
            </button>
            <button
              onClick={handleBackRestore}
              className="flex-1 py-2 bg-white border border-yellow-300 text-yellow-700 rounded-xl text-xs font-medium"
            >
              元の並び順に戻して終了
            </button>
          </div>
          <button
            onClick={() => setShowBackConfirm(false)}
            className="mt-2 w-full py-1.5 text-xs text-yellow-600 text-center"
          >
            キャンセル（設定を続ける）
          </button>
        </div>
      )}

      <main className="pb-8 space-y-4 mt-4">
        {/* 前回比の色強調設定 */}
        <section className="bg-white mx-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-600">前回比の色強調</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">変化率が閾値を超えたとき赤・青で強調表示</p>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">色強調を有効にする</span>
              <button
                onClick={() => setSettings(s => ({ ...s, changeHighlight: !s.changeHighlight }))}
                className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors shrink-0 ${settings.changeHighlight ? "bg-red-500" : "bg-gray-300"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${settings.changeHighlight ? "left-6" : "left-1"}`} />
              </button>
            </div>
            {settings.changeHighlight && (
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  強調する変化率の閾値（現在: {settings.changeThreshold ?? 10}%）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={settings.changeThreshold ?? 10}
                    onChange={(e) => {
                      const s = sanitizeNum(e.target.value);
                      const v = parseFloat(s);
                      if (!isNaN(v) && v >= 0) setSettings(st => ({ ...st, changeThreshold: v }));
                    }}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 tabular-nums"
                  />
                  <span className="text-sm text-gray-500">%</span>
                  <span className="text-xs text-gray-400">（この値を超えると赤・青で表示）</span>
                </div>
              </div>
            )}
            <button
              onClick={handleSave}
              className="w-full py-2 rounded-xl font-medium text-sm bg-red-600 text-white"
            >
              保存
            </button>
          </div>
        </section>

        {/* AI 分析コンテキスト設定 */}
        <section className="bg-white mx-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-600">AI分析コンテキスト</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">AIが参照する過去データの範囲を設定</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                季節コンテキスト（同月±1ヶ月）参照年数
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={settings.aiSeasonalYears ?? 2}
                  onChange={(e) => {
                    const s = sanitizeNum(e.target.value);
                    const v = parseInt(s);
                    if (!isNaN(v) && v >= 1 && v <= 10) setSettings(st => ({ ...st, aiSeasonalYears: v }));
                  }}
                  className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 tabular-nums"
                />
                <span className="text-sm text-gray-500">年分</span>
                <span className="text-xs text-gray-400">（1〜10）</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                直近参照レコード件数
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={settings.aiRecentRecords ?? 3}
                  onChange={(e) => {
                    const s = sanitizeNum(e.target.value);
                    const v = parseInt(s);
                    if (!isNaN(v) && v >= 1 && v <= 20) setSettings(st => ({ ...st, aiRecentRecords: v }));
                  }}
                  className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 tabular-nums"
                />
                <span className="text-sm text-gray-500">件</span>
                <span className="text-xs text-gray-400">（1〜20）</span>
              </div>
            </div>
            <button
              onClick={handleSave}
              className="w-full py-2 rounded-xl font-medium text-sm bg-red-600 text-white"
            >
              保存
            </button>
          </div>
        </section>

        {/* データ管理 */}
        <section className="bg-white mx-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-600">データ管理</h2>
            <div className="relative">
              <button
                onClick={() => {
                  if (dataHelpTimerRef.current) clearTimeout(dataHelpTimerRef.current);
                  setShowDataHelp(v => {
                    if (!v) {
                      dataHelpTimerRef.current = setTimeout(() => setShowDataHelp(false), 6000);
                    }
                    return !v;
                  });
                }}
                className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center leading-none"
              >?</button>
              {showDataHelp && (
                <div className="absolute left-0 top-6 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 w-72 shadow-lg text-left">
                  <p className="font-bold mb-2">各形式の使い方</p>

                  <p className="font-semibold text-yellow-300">CSV</p>
                  <p className="mt-0.5 text-gray-300">血液検査グラフアプリと互換の形式。外部アプリとのデータ移行に使用。</p>
                  <p className="mt-1.5 text-gray-400 font-medium">列順（左から）:</p>
                  <p className="text-gray-300 mt-0.5 font-mono text-[10px] leading-relaxed">年 / 月 / 日 / 項目名称 / 項目略称 / 値 / 単位 / 正常値下限 / 正常値上限</p>

                  <p className="font-semibold text-yellow-300 mt-3">JSON</p>
                  <p className="mt-0.5 text-gray-300">このアプリ独自のバックアップ形式。完全復元に使用。</p>
                  <p className="mt-1.5 text-gray-400 font-medium">含まれるデータ:</p>
                  <p className="text-gray-300 mt-0.5 font-mono text-[10px] leading-relaxed">items（項目設定）/ records（検査記録）/ events（イベント）/ exportedAt（出力日時）</p>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 space-y-3">
            {importMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {importMsg}
              </p>
            )}
            {/* インポート */}
            <label className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition">
              <FileUp size={16} />
              CSVインポート
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            </label>
            <label className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition">
              <FileUp size={16} />
              JSONインポート
              <input type="file" accept=".json" className="hidden" onChange={handleJSONImport} />
            </label>
            {/* エクスポート */}
            <button
              onClick={handleCSVExport}
              className="w-full flex items-center gap-2 py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <FileDown size={16} />
              CSVエクスポート
            </button>
            <button
              onClick={handleJSONExport}
              className="w-full flex items-center gap-2 py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <FileDown size={16} />
              JSONエクスポート
            </button>
            {/* 削除 */}
            <button
              onClick={handleClearData}
              className="w-full flex items-center gap-2 py-2.5 px-4 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 size={16} />
              全データを削除
            </button>
          </div>
        </section>

        {/* 項目管理 */}
        <section className="bg-white mx-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-600">検査項目の管理</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">基準値編集・表示ON/OFF</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReorderMode((v) => !v)}
                className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition ${
                  reorderMode
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <GripVertical size={12} />
                並び替え
              </button>
            </div>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-full"
            >
              {showAddForm ? <X size={13} /> : <Plus size={13} />}
              {showAddForm ? "閉じる" : "項目を追加"}
            </button>
          </div>

          {/* 新規項目追加フォーム */}
          {showAddForm && (
            <div className="p-4 bg-red-50 border-b border-red-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-500 font-medium">項目名 *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    maxLength={100}
                    placeholder="例: HbA1c"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium">ID/略称</label>
                  <input
                    type="text"
                    value={newItem.id}
                    onChange={(e) => setNewItem({ ...newItem, id: e.target.value })}
                    maxLength={50}
                    placeholder="例: HbA1c"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-gray-500 font-medium">単位</label>
                  <input
                    type="text"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="例: %"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium">基準値 下限</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newItem.rangeMin}
                    onChange={(e) => setNewItem({ ...newItem, rangeMin: sanitizeNum(e.target.value) })}
                    placeholder="—"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium">基準値 上限</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newItem.rangeMax}
                    onChange={(e) => setNewItem({ ...newItem, rangeMax: sanitizeNum(e.target.value) })}
                    placeholder="—"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 font-medium">カテゴリ</label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value as ItemCategory })}
                  className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-red-400 bg-white"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddItem}
                disabled={!newItem.name.trim()}
                className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                追加する
              </button>
            </div>
          )}

          {/* 項目一覧（ドラッグ並び替え対応） */}
          <Reorder.Group
            axis="y"
            values={items}
            onReorder={handleReorder}
            className="divide-y divide-gray-50"
          >
            {items.map((item) => (
              <SortableItemRow
                key={item.id}
                item={item}
                editingId={editingId}
                editValues={editValues}
                reorderMode={reorderMode}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onToggleVisibility={toggleItemVisibility}
                onEditValuesChange={setEditValues}
              />
            ))}
          </Reorder.Group>
        </section>

        <section className="px-4 text-center">
          <p className="text-xs text-gray-400">BloodTrack v1.0.0</p>
          <p className="text-[11px] text-gray-300 mt-1">Powered by Gemini AI · LocalStorage</p>
        </section>
      </main>
    </div>
  );
}
