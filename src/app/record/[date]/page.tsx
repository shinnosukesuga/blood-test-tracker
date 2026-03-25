"use client";

import { use, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Settings, TrendingUp, Pencil, Check, X, Trash2, AlertTriangle, Sparkles, Send } from "lucide-react";
import { loadRecords, loadItems, saveRecord, deleteRecord, loadSettings, loadAIConversation, saveAIMessage } from "@/lib/storage";
import { isAbnormal } from "@/lib/itemMaster";
import { BloodRecord, ItemMaster, AIMessage } from "@/lib/types";
import { analyzeWithContext } from "@/lib/gemini";
import { sanitizeNum } from "@/lib/utils";
import DraggableItemList from "@/components/DraggableItemList";
import DatePicker from "@/components/DatePicker";
import ReactMarkdown from "react-markdown";

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${dateStr}(${DAY_NAMES[d.getDay()]})`;
}

export default function RecordDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const router = useRouter();

  const [items,   setItems]   = useState<ItemMaster[]>([]);
  const [record,  setRecord]  = useState<BloodRecord | null>(null);
  const [allRecords, setAllRecords] = useState<BloodRecord[]>([]);
  const [showAbnOnly, setShowAbnOnly] = useState(false);

  // AI チャット
  const [aiMessages,   setAiMessages]   = useState<AIMessage[]>([]);
  const [aiInput,      setAiInput]      = useState("");
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 編集モーダル
  const [editing,      setEditing]      = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [editDate,     setEditDate]     = useState("");
  const [editValues,   setEditValues]   = useState<Record<string, string>>({});
  const [origDate,     setOrigDate]     = useState("");
  const [origValues,   setOrigValues]   = useState<Record<string, string>>({});
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);

  useEffect(() => {
    const allItems = loadItems();
    setItems(allItems);
    const records = loadRecords();
    setAllRecords(records);
    const rec = records.find(r => r.date === date) ?? null;
    setRecord(rec);
    if (rec) {
      const conv = loadAIConversation(rec.id);
      if (conv) setAiMessages(conv.messages);
    }
  }, [date]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const handleAiAnalyze = async (userMsg: string | null = null) => {
    if (!record) return;
    const settings = loadSettings();
    setAiError("");
    setAiLoading(true);

    // ユーザーメッセージをまず保存・表示
    let history = [...aiMessages];
    if (userMsg) {
      const userMessage: AIMessage = { role: "user", content: userMsg, createdAt: new Date().toISOString() };
      saveAIMessage(record.id, userMessage);
      history = [...history, userMessage];
      setAiMessages(history);
      setAiInput("");
    }

    try {
      const recentRecords = allRecords
        .filter(r => r.id !== record.id && r.date < record.date)
        .slice(0, settings.aiRecentRecords ?? 3);

      const aiText = await analyzeWithContext(
        record,
        recentRecords,
        allRecords,
        items,
        history,
        userMsg,
        settings.aiSeasonalYears ?? 2
      );

      const aiMessage: AIMessage = { role: "ai", content: aiText, createdAt: new Date().toISOString() };
      saveAIMessage(record.id, aiMessage);
      setAiMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      setAiError(`AI分析エラー: ${e}`);
    } finally {
      setAiLoading(false);
    }
  };

  const openEdit = () => {
    if (!record) return;
    const vals = Object.fromEntries(
      Object.entries(record.values).map(([k, v]) => [k, String(v)])
    );
    setEditDate(record.date);
    setEditValues(vals);
    setOrigDate(record.date);
    setOrigValues(vals);
    setConfirmClose(false);
    setEditing(true);
  };

  const hasChanges = () => {
    if (editDate !== origDate) return true;
    const keys = new Set([...Object.keys(editValues), ...Object.keys(origValues)]);
    for (const k of keys) {
      if ((editValues[k] ?? "") !== (origValues[k] ?? "")) return true;
    }
    return false;
  };

  const handleEditSave = () => {
    if (!record || !editDate) return;
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(editValues)) {
      const n = parseFloat(v);
      if (!isNaN(n)) values[k] = n;
    }
    // 日付が変わった場合は古いレコードを削除して新しいIDで保存
    const updatedRecord: BloodRecord = {
      ...record,
      date: editDate,
      values,
    };
    if (editDate !== record.date) {
      deleteRecord(record.id);
    }
    saveRecord(updatedRecord);
    setRecord(updatedRecord);
    setEditing(false);
    if (editDate !== date) {
      router.replace(`/record/${editDate}`);
    }
  };

  const handleDelete = () => {
    if (!record) return;
    deleteRecord(record.id);
    router.replace("/");
  };

  const handleReorder = useCallback(() => {}, []);

  const sortedItems = useMemo(
    () => [...items].filter(i => i.visible).sort((a, b) => a.order - b.order),
    [items]
  );
  const filteredItems = useMemo(
    () => showAbnOnly
      ? sortedItems.filter(item => {
          const val = record?.values[item.id];
          return val !== undefined && isAbnormal(item, val);
        })
      : sortedItems,
    [sortedItems, showAbnOnly, record]
  );

  const itemCount   = record ? Object.keys(record.values).length : 0;
  const abnCount    = sortedItems.filter(item => {
    const val = record?.values[item.id];
    return val !== undefined && isAbnormal(item, val);
  }).length;

  const allSortedItems = [...items].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <p className="text-red-200 text-[11px]">検査結果</p>
            <h1 className="text-base font-bold leading-tight">{record ? fmtDay(record.date) : date}</h1>
          </div>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 rounded-full bg-red-500 hover:bg-red-400 transition"
            title="削除"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={openEdit}
            className="p-2 rounded-full bg-red-500 hover:bg-red-400 transition"
            title="編集"
          >
            <Pencil size={16} />
          </button>
        </div>
      </header>

      {/* 削除確認ダイアログ */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm"
            >
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={22} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-800">この記録を削除しますか？</p>
                  <p className="text-xs text-gray-500 mt-1">{record ? fmtDay(record.date) : date} の記録を削除します。この操作は取り消せません。</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold"
                >
                  削除する
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
                >
                  キャンセル
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 pb-24">
        {/* 件数バー */}
        {record && (
          <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">
              検索項目数: <b>{itemCount}</b>項目　閾値外: <b className={abnCount > 0 ? "text-red-600" : ""}>{abnCount}</b>項目
            </span>
            {/* 閾値外のみ（右） */}
            <button
              onClick={() => setShowAbnOnly(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                showAbnOnly ? "bg-red-50 text-red-700 border-red-300" : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            >
              <div className={`w-7 h-3.5 rounded-full relative transition-colors ${showAbnOnly ? "bg-red-500" : "bg-gray-300"}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${showAbnOnly ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </div>
              閾値外のみ
            </button>
          </div>
        )}

        {!record ? (
          <div className="text-center py-20 text-gray-400">
            <p>この日の記録が見つかりません</p>
          </div>
        ) : (
          <>
            <DraggableItemList
              items={filteredItems}
              record={record}
              onReorder={handleReorder}
            />

            {/* AI チャットセクション */}
            <div className="mx-4 mt-4 mb-2">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-red-500" />
                    <h2 className="text-sm font-semibold text-gray-700">AI分析</h2>
                  </div>
                  {aiMessages.length === 0 && (
                    <button
                      onClick={() => handleAiAnalyze(null)}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full disabled:opacity-50"
                    >
                      <Sparkles size={12} />
                      {aiLoading ? "分析中..." : "この記録を分析する"}
                    </button>
                  )}
                </div>

                {/* 会話履歴 */}
                {aiMessages.length > 0 && (
                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-red-600 text-white rounded-br-sm"
                            : "bg-gray-100 text-gray-800 rounded-bl-sm"
                        }`}>
                          {msg.role === "user" ? (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          ) : (
                            <ReactMarkdown
                              allowedElements={["p", "strong", "em", "ul", "ol", "li", "br"]}
                              unwrapDisallowed
                              components={{
                                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                                li: ({ children }) => <li>{children}</li>,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-500">
                          分析中...
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                )}

                {aiError && (
                  <p className="px-4 py-2 text-xs text-red-600">{aiError}</p>
                )}

                {/* 入力欄（初回分析後に表示） */}
                {aiMessages.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-2 flex items-end gap-2">
                    <textarea
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey && aiInput.trim()) {
                          e.preventDefault();
                          handleAiAnalyze(aiInput.trim());
                        }
                      }}
                      placeholder="AIへの質問・追記（例：この頃から薬を飲み始めた）"
                      rows={2}
                      className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-red-400 bg-gray-50"
                    />
                    <button
                      onClick={() => aiInput.trim() && handleAiAnalyze(aiInput.trim())}
                      disabled={aiLoading || !aiInput.trim()}
                      className="p-2 bg-red-600 text-white rounded-full disabled:opacity-40 shrink-0"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* 編集モーダル */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-white"
          >
            <div className="bg-red-600 text-white px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-red-200">データ修正</p>
                <h2 className="text-base font-bold">{fmtDay(editDate)}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEditSave}
                  className="flex items-center justify-center gap-1.5 w-24 bg-white text-red-600 py-1.5 rounded-full text-sm font-bold shadow"
                >
                  <Check size={14} /> 保存
                </button>
                <button
                  onClick={() => hasChanges() ? setConfirmClose(true) : setEditing(false)}
                  className="flex items-center justify-center gap-1.5 w-24 bg-white text-red-600 py-1.5 rounded-full text-sm font-bold shadow"
                >
                  <X size={14} /> 閉じる
                </button>
              </div>
            </div>

            {/* 閉じる確認 */}
            <AnimatePresence>
              {confirmClose && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center justify-between shrink-0"
                >
                  <p className="text-sm text-yellow-800 font-medium">変更を破棄しますか？</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmClose(false); setEditing(false); }}
                      className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-xs font-bold"
                    >
                      破棄する
                    </button>
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="px-3 py-1.5 bg-white border border-yellow-300 text-yellow-700 rounded-lg text-xs font-medium"
                    >
                      キャンセル
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 日付編集 */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
              <label className="text-xs text-gray-500 font-medium block mb-1">検査日</label>
              <button
                onClick={() => setShowDatePicker(true)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-left w-full text-gray-800"
              >
                {editDate || "日付を選択"}
              </button>
              {showDatePicker && (
                <DatePicker
                  value={editDate}
                  onChange={setEditDate}
                  onClose={() => setShowDatePicker(false)}
                />
              )}
            </div>

            {/* 項目一覧 */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {allSortedItems.map(item => {
                const val = editValues[item.id] ?? "";
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
                      onChange={e => setEditValues(prev => ({ ...prev, [item.id]: sanitizeNum(e.target.value) }))}
                      placeholder="—"
                      className={`w-24 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400 ${
                        abnormal ? "border-red-300 bg-red-50 text-red-700 font-bold" : "border-gray-200 bg-gray-50"
                      }`}
                    />
                    <span className="text-xs text-gray-400 w-14 shrink-0 text-left">{item.unit}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="max-w-md mx-auto flex">
          <Link href="/" className="flex-1 flex flex-col items-center pt-2 pb-3 text-gray-400 hover:text-gray-600 transition">
            <TrendingUp size={22} />
            <span className="text-[10px] mt-0.5 font-medium">記録</span>
          </Link>
          <Link href="/settings" className="flex-1 flex flex-col items-center pt-2 pb-3 text-gray-400 hover:text-gray-600 transition">
            <Settings size={22} />
            <span className="text-[10px] mt-0.5 font-medium">設定</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
