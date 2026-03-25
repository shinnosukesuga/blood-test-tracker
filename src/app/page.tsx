"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Settings, Plus, ChevronRight, TrendingUp, Check, X, PenLine, Trash2, AlertTriangle } from "lucide-react";
import { loadRecords, saveRecord, loadItems, generateId, deleteRecord } from "@/lib/storage";
import { isAbnormal } from "@/lib/itemMaster";
import { BloodRecord, ItemMaster } from "@/lib/types";
import DatePicker from "@/components/DatePicker";

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateWithDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${dateStr}(${DAY_NAMES[d.getDay()]})`;
}

export default function HomePage() {
  const router = useRouter();
  const [records, setRecords] = useState<BloodRecord[]>([]);
  const [items,   setItems]   = useState<ItemMaster[]>([]);
  const [selYear,  setSelYear]  = useState<string>("すべて");
  const [selMonth, setSelMonth] = useState<string>("すべて");

  // 追加選択シート
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  // 削除モード
  const [deleteMode,    setDeleteMode]    = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleDeleteMode = () => {
    setDeleteMode(v => !v);
    setSelectedDates(new Set());
    setConfirmDelete(false);
  };

  const toggleSelectDate = (date: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  const handleDeleteConfirmed = () => {
    selectedDates.forEach(date => {
      const rec = records.find(r => r.date === date);
      if (rec) deleteRecord(rec.id);
    });
    setRecords(loadRecords());
    setDeleteMode(false);
    setSelectedDates(new Set());
    setConfirmDelete(false);
  };

  // 手動登録モーダル
  const [newOpen, setNewOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newVals, setNewVals] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    setRecords(loadRecords());
    setItems(loadItems());
  }, []);

  // 年リスト（データから生成）
  const years = useMemo(() => {
    const set = new Set(records.map(r => r.date.slice(0, 4)));
    return ["すべて", ...Array.from(set).sort((a, b) => b.localeCompare(a))];
  }, [records]);

  // 月リスト（選択年に存在する月のみ）
  const months = useMemo(() => {
    const base = selYear === "すべて" ? records : records.filter(r => r.date.startsWith(selYear));
    const set = new Set(base.map(r => r.date.slice(5, 7)));
    return ["すべて", ...Array.from(set).sort()];
  }, [records, selYear]);

  // 年が変わったら月リセット
  const handleYearChange = (y: string) => {
    setSelYear(y);
    setSelMonth("すべて");
  };

  // 年＋月フィルター
  const filtered = records.filter(r => {
    if (selYear !== "すべて" && !r.date.startsWith(selYear)) return false;
    if (selMonth !== "すべて" && r.date.slice(5, 7) !== selMonth) return false;
    return true;
  });

  const openNew = () => {
    setNewDate(new Date().toISOString().slice(0, 10));
    setNewVals({});
    setAddSheetOpen(false);
    setNewOpen(true);
  };

  const handleNewSave = () => {
    if (!newDate) return;
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(newVals)) {
      const n = parseFloat(v);
      if (!isNaN(n)) values[k] = n;
    }
    const record: BloodRecord = { id: generateId(), date: newDate, values, note: "", createdAt: new Date().toISOString() };
    saveRecord(record);
    setRecords(loadRecords());
    setNewOpen(false);
    router.push(`/record/${newDate}`);
  };

  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  // 全角→半角変換 ＋ 半角数値・小数点のみ許可
  const sanitizeNum = (v: string) => {
    const half = v.replace(/[０-９．]/g, s =>
      s === "．" ? "." : String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );
    const c = half.replace(/[^0-9.]/g, "");
    const parts = c.split(".");
    return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : c;
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">

      {/* ヘッダー */}
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold tracking-tight">BloodTrack</h1>
          <span className="text-red-200 text-xs">血液検査管理</span>
        </div>
      </header>

      {/* 年・月フィルター（ヘッダー下） */}
      {records.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-2 sticky top-[56px] z-10">
          <span className="text-xs text-gray-500 shrink-0 font-medium">年</span>
          <select
            value={selYear}
            onChange={e => handleYearChange(e.target.value)}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-red-400"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500 shrink-0 font-medium">月</span>
          <select
            value={selMonth}
            onChange={e => setSelMonth(e.target.value)}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-red-400"
          >
            {months.map(m => (
              <option key={m} value={m}>{m === "すべて" ? "すべて" : `${parseInt(m)}月`}</option>
            ))}
          </select>
          {/* ゴミ箱ボタン */}
          <button
            onClick={toggleDeleteMode}
            className={`p-2 rounded-lg border transition shrink-0 ${
              deleteMode
                ? "bg-red-50 border-red-300 text-red-600"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200"
            }`}
          >
            {deleteMode ? <X size={16} /> : <Trash2 size={16} />}
          </button>
        </div>
      )}

      <main className="pb-24">
        {records.length === 0 ? (
          <div className="text-center py-20 px-8">
            <div className="text-6xl mb-4">🩺</div>
            <p className="text-lg font-semibold text-gray-600">データがありません</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              設定からCSVをインポートするか、<br />
              下の追加ボタンから検査結果を登録しましょう
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">{selYear}年の記録はありません</p>
          </div>
        ) : (
          <>
          <div className="bg-white mt-2 divide-y divide-gray-100">
            {filtered.map(record => (
              <div
                key={record.id}
                onClick={() =>
                  deleteMode
                    ? toggleSelectDate(record.date)
                    : router.push(`/record/${record.date}`)
                }
                className={`w-full flex items-center px-4 py-4 cursor-pointer transition-colors ${
                  deleteMode && selectedDates.has(record.date)
                    ? "bg-red-50"
                    : "hover:bg-gray-50 active:bg-gray-100"
                }`}
              >
                {/* 削除モード時のチェックボックス */}
                {deleteMode && (
                  <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center shrink-0 transition-colors ${
                    selectedDates.has(record.date)
                      ? "bg-red-500 border-red-500"
                      : "border-gray-300"
                  }`}>
                    {selectedDates.has(record.date) && <Check size={11} className="text-white" />}
                  </div>
                )}
                <span className={`flex-1 text-left text-base tabular-nums font-medium ${
                  deleteMode && selectedDates.has(record.date) ? "text-red-700" : "text-gray-800"
                }`}>
                  {formatDateWithDay(record.date)}
                </span>
                {!deleteMode && <ChevronRight size={18} className="text-gray-300" />}
              </div>
            ))}
          </div>

          {/* 削除モード：選択件数バー＋削除ボタン */}
          <AnimatePresence>
            {deleteMode && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="fixed bottom-16 left-0 right-0 z-10 max-w-md mx-auto px-4 pb-2"
              >
                {/* 確認ダイアログ */}
                <AnimatePresence>
                  {confirmDelete && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="bg-white border border-red-200 rounded-2xl shadow-lg p-4 mb-2"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-800">
                            {selectedDates.size}件の記録を削除しますか？
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">この操作は取り消せません</p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleDeleteConfirmed}
                              className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold"
                            >
                              削除する
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 削除実行ボタン */}
                <button
                  onClick={() => selectedDates.size > 0 && setConfirmDelete(true)}
                  disabled={selectedDates.size === 0}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm shadow-lg transition ${
                    selectedDates.size > 0
                      ? "bg-red-600 text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Trash2 size={16} />
                  {selectedDates.size > 0 ? `${selectedDates.size}件を削除` : "削除する日付を選択してください"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          </>
        )}
      </main>

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="max-w-md mx-auto flex">
          <Link href="/" className="flex-1 flex flex-col items-center pt-2 pb-3 text-red-600">
            <TrendingUp size={22} />
            <span className="text-[10px] mt-0.5 font-medium">記録</span>
          </Link>

          {/* 中央：追加ボタン */}
          <button
            onClick={() => setAddSheetOpen(true)}
            className="flex-1 flex flex-col items-center pb-3"
          >
            <div className="bg-red-600 text-white rounded-full p-3 -mt-6 shadow-lg border-4 border-gray-50">
              <Plus size={22} />
            </div>
            <span className="text-[10px] mt-1 font-medium text-gray-400">追加</span>
          </button>

          <Link href="/settings" className="flex-1 flex flex-col items-center pt-2 pb-3 text-gray-400 hover:text-gray-600 transition">
            <Settings size={22} />
            <span className="text-[10px] mt-0.5 font-medium">設定</span>
          </Link>
        </div>
      </nav>

      {/* 追加選択シート */}
      <AnimatePresence>
        {addSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-30"
              onClick={() => setAddSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-white rounded-t-2xl shadow-xl pb-8"
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
              <p className="text-center text-sm font-semibold text-gray-600 mb-4">記録を追加</p>

              <div className="px-4 space-y-3">
                {/* AIスキャン */}
                <button
                  onClick={() => { setAddSheetOpen(false); router.push("/scan"); }}
                  className="w-full flex items-center gap-4 px-4 py-4 bg-red-50 border border-red-200 rounded-2xl hover:bg-red-100 transition"
                >
                  <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center shrink-0">
                    <Camera size={24} className="text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-800">AIスキャン</p>
                    <p className="text-xs text-gray-500 mt-0.5">検査票を撮影してAIが自動入力</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 ml-auto" />
                </button>

                {/* 手動登録 */}
                <button
                  onClick={openNew}
                  className="w-full flex items-center gap-4 px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl hover:bg-gray-100 transition"
                >
                  <div className="w-12 h-12 bg-gray-600 rounded-xl flex items-center justify-center shrink-0">
                    <PenLine size={24} className="text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-800">手動登録</p>
                    <p className="text-xs text-gray-500 mt-0.5">数値を直接入力して登録</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 ml-auto" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 手動登録モーダル */}
      <AnimatePresence>
        {newOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-white"
          >
            <div className="bg-red-600 text-white px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-red-200">手動登録</p>
                <h2 className="text-lg font-bold">検査結果を入力</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNewSave}
                  disabled={!newDate}
                  className="flex items-center justify-center gap-1.5 w-24 bg-white text-red-600 py-1.5 rounded-full text-sm font-bold shadow disabled:opacity-40"
                >
                  <Check size={14} /> 保存
                </button>
                <button
                  onClick={() => setNewOpen(false)}
                  className="flex items-center justify-center gap-1.5 w-24 bg-white text-red-600 py-1.5 rounded-full text-sm font-bold shadow"
                >
                  <X size={14} /> 閉じる
                </button>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
              <label className="text-xs text-gray-500 font-medium block mb-1">検査日</label>
              <button
                onClick={() => setShowDatePicker(true)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-left w-full text-gray-800"
              >
                {newDate || "日付を選択"}
              </button>
              {showDatePicker && (
                <DatePicker
                  value={newDate}
                  onChange={setNewDate}
                  onClose={() => setShowDatePicker(false)}
                />
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {sortedItems.map(item => {
                const val = newVals[item.id] ?? "";
                const numVal = parseFloat(val);
                const abnormal = !isNaN(numVal) && isAbnormal(item, numVal);
                const rangeLabel = item.range.min !== null && item.range.max !== null
                  ? `(${item.range.min}〜${item.range.max})`
                  : item.range.max !== null ? `(〜${item.range.max})`
                  : item.range.min !== null ? `(${item.range.min}〜)` : "";
                return (
                  <div
                    key={item.id}
                    className={`flex items-center px-4 py-3 gap-3 ${abnormal ? "bg-red-50" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${abnormal ? "text-red-700" : "text-gray-800"}`}>
                        {item.name}
                      </p>
                      {rangeLabel && <p className="text-[10px] text-gray-400">{rangeLabel} {item.unit}</p>}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={e => setNewVals(prev => ({ ...prev, [item.id]: sanitizeNum(e.target.value) }))}
                      placeholder="—"
                      className={`w-24 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400 ${
                        abnormal ? "border-red-300 bg-red-50 text-red-700 font-bold" : "border-gray-200 bg-gray-50"
                      }`}
                    />
                    <span className="text-xs text-gray-400 w-14 shrink-0">{item.unit}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
