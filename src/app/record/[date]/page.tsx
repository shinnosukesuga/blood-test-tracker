"use client";

import { use, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronUp, Pencil, Check, X, Trash2, AlertTriangle, Sparkles, Send, Star, AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { loadRecords, loadItems, saveRecord, deleteRecord, loadSettings, loadAIConversation, saveAIMessage, saveAIConversation } from "@/lib/firestoreStorage";
import { useAuth } from "@/contexts/AuthContext";
import { isAbnormal } from "@/lib/itemMaster";
import { BloodRecord, ItemMaster, AIMessage } from "@/lib/types";
import { analyzeWithContext } from "@/lib/gemini";
import { sanitizeNum } from "@/lib/utils";
import DraggableItemList from "@/components/DraggableItemList";
import ReactMarkdown from "react-markdown";

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${dateStr}(${DAY_NAMES[d.getDay()]})`;
}

export default function RecordDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [items,   setItems]   = useState<ItemMaster[]>([]);
  const [record,  setRecord]  = useState<BloodRecord | null>(null);
  const [allRecords, setAllRecords] = useState<BloodRecord[]>([]);
  const [showAbnOnly, setShowAbnOnly] = useState(false);
  const [showRequiredOnly, setShowRequiredOnly] = useState(false);

  useEffect(() => {
    setShowAbnOnly(searchParams.get("abn") === "1");
    setShowRequiredOnly(searchParams.get("req") === "1");
  }, [searchParams]);

  // フィルター状態をURLパラメータで引き継ぐ
  const withFilter = useCallback((path: string) => {
    const q = [showAbnOnly ? "abn=1" : "", showRequiredOnly ? "req=1" : ""].filter(Boolean).join("&");
    return q ? `${path}?${q}` : path;
  }, [showAbnOnly, showRequiredOnly]);

  // AI チャット
  const [aiMessages,   setAiMessages]   = useState<AIMessage[]>([]);
  const [aiInput,      setAiInput]      = useState("");
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState("");
  const [aiSelectMode,    setAiSelectMode]    = useState(false);
  const [aiSelected,      setAiSelected]      = useState<Set<number>>(new Set());
  const [confirmAiDelete, setConfirmAiDelete] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const needsScrollRef = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  // 編集モーダル
  const [editing,      setEditing]      = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [editDate,     setEditDate]     = useState("");
  const [editValues,   setEditValues]   = useState<Record<string, string>>({});
  const [origDate,     setOrigDate]     = useState("");
  const [origValues,   setOrigValues]   = useState<Record<string, string>>({});
  const [confirmDelete,   setConfirmDelete]   = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    const load = async () => {
      const [allItems, records] = await Promise.all([loadItems(user.uid), loadRecords(user.uid)]);
      setItems(allItems);
      setAllRecords(records);
      const rec = records.find(r => r.date === date) ?? null;
      setRecord(rec);
      if (rec) {
        const conv = await loadAIConversation(user.uid, rec.id);
        if (conv) setAiMessages(conv.messages);
      }
    };
    load();
  }, [date, user, router]);

  useEffect(() => {
    if (!needsScrollRef.current) return;
    needsScrollRef.current = false;
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const handleAiAnalyze = async (userMsg: string | null = null) => {
    if (!record || !user) return;
    const settings = await loadSettings(user.uid);
    setAiError("");
    setAiLoading(true);
    needsScrollRef.current = true;

    // ユーザーメッセージをまず保存・表示
    let history = [...aiMessages];
    if (userMsg) {
      const userMessage: AIMessage = { role: "user", content: userMsg, createdAt: new Date().toISOString() };
      await saveAIMessage(user.uid, record.id, userMessage);
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
      await saveAIMessage(user.uid, record.id, aiMessage);
      setAiMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      setAiError(`AI分析エラー: ${e}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiDeleteSelected = async () => {
    if (!record || !user || aiSelected.size === 0) return;
    const remaining = aiMessages.filter((_, i) => !aiSelected.has(i));
    await saveAIConversation(user.uid, record.id, remaining);
    setAiMessages(remaining);
    setAiSelected(new Set());
    setAiSelectMode(false);
    setConfirmAiDelete(false);
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

  const handleEditSave = async () => {
    if (!record || !editDate || !user) return;
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(editValues)) {
      const n = parseFloat(v);
      if (!isNaN(n)) values[k] = n;
    }
    const updatedRecord: BloodRecord = { ...record, date: editDate, values };
    if (editDate !== record.date) {
      await deleteRecord(user.uid, record.id);
    }
    await saveRecord(user.uid, updatedRecord);
    setRecord(updatedRecord);
    setEditing(false);
    if (editDate !== date) {
      router.replace(`/record/${editDate}`);
    }
  };

  const handleDelete = async () => {
    if (!record || !user) return;
    await deleteRecord(user.uid, record.id);
    router.replace("/");
  };

  const handleReorder = useCallback(() => {}, []);

  const sortedItems = useMemo(
    () => [...items].filter(i => i.visible).sort((a, b) => a.order - b.order),
    [items]
  );
  const filteredItems = useMemo(() => {
    let result = sortedItems;
    if (showAbnOnly) result = result.filter(item => {
      const val = record?.values[item.id];
      return val !== undefined && isAbnormal(item, val);
    });
    if (showRequiredOnly) result = result.filter(item => item.required);
    return result;
  }, [sortedItems, showAbnOnly, showRequiredOnly, record]);

  // フィルター結果が1ページに収まるか判定
  // getBoundingClientRect().top はスクロール位置依存なので offsetTop + scrollY で絶対位置を使う
  useEffect(() => {
    const check = () => {
      if (!aiSectionRef.current) return;
      const absoluteTop = aiSectionRef.current.getBoundingClientRect().top + window.scrollY;
      setNeedsScroll(absoluteTop > window.innerHeight - 10);
    };
    const raf = requestAnimationFrame(check);
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", check);
    };
  }, [filteredItems, aiMessages]);

  const itemCount      = record ? Object.keys(record.values).length : 0;
  const abnCount       = sortedItems.filter(item => {
    const val = record?.values[item.id];
    return val !== undefined && isAbnormal(item, val);
  }).length;
  const requiredCount  = sortedItems.filter(item => item.required).length;

  const allSortedItems = [...items].sort((a, b) => a.order - b.order);

  // allRecords は降順（新→旧）なので index+1 が前回、index-1 が翌回
  const currentRecordIdx = allRecords.findIndex(r => r.date === date);
  const prevRecord = currentRecordIdx < allRecords.length - 1 ? allRecords[currentRecordIdx + 1] : null;
  const nextRecord = currentRecordIdx > 0 ? allRecords[currentRecordIdx - 1] : null;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-1">
          <button onClick={() => router.push("/")} className="p-3 -ml-2 shrink-0">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-red-200 text-[11px]">検査結果</p>
            <h1 className="text-base font-bold leading-tight truncate">{record ? fmtDay(record.date) : date}</h1>
          </div>
          {/* 前回・翌回ナビ */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                const target = prevRecord ?? (allRecords.length > 1 ? allRecords[0] : null);
                target && router.replace(withFilter(`/record/${target.date}`));
              }}
              disabled={allRecords.length <= 1}
              className="p-3 rounded-full bg-red-500 disabled:opacity-30 active:bg-red-700 transition-colors"
              title={prevRecord?.date ?? allRecords[0]?.date}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => {
                const target = nextRecord ?? (allRecords.length > 1 ? allRecords[allRecords.length - 1] : null);
                target && router.replace(withFilter(`/record/${target.date}`));
              }}
              disabled={allRecords.length <= 1}
              className="p-3 rounded-full bg-red-500 disabled:opacity-30 active:bg-red-700 transition-colors"
              title={nextRecord?.date ?? allRecords[allRecords.length - 1]?.date}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* AIメッセージ削除確認ダイアログ */}
      <AnimatePresence>
        {confirmAiDelete && (
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
                  <p className="text-sm font-bold text-gray-800">{aiSelected.size}件のメッセージを削除しますか？</p>
                  <p className="text-xs text-gray-500 mt-1">この操作は取り消せません。</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAiDelete(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAiDeleteSelected}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold"
                >
                  削除する
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold"
                >
                  削除する
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 pb-24">
        {/* 件数バー（sticky） */}
        {record && (
          <div className="bg-white border-b border-gray-100 px-4 pt-2 pb-1.5 sticky top-[72px] z-[9]">
            {/* 1行目: 件数 */}
            <span className="text-xs text-gray-600 block text-center">
              検索項目数: <b>{itemCount}</b>項目　閾値外: <b className={abnCount > 0 ? "text-red-600" : ""}>{abnCount}</b>項目　注目: <b>{requiredCount}</b>項目
            </span>
            {/* 2行目: 削除・編集・フィルターボタン */}
            <div className="flex items-center gap-1.5 mt-1">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex flex-1 items-center justify-center gap-1 py-1 rounded-full text-xs font-medium border transition bg-gray-50 text-red-500 border-gray-200 active:bg-red-50"
              >
                <Trash2 size={11} />
                削除
              </button>
              <button
                onClick={openEdit}
                className="flex flex-1 items-center justify-center gap-1 py-1 rounded-full text-xs font-medium border transition bg-gray-50 text-gray-500 border-gray-200 active:bg-gray-100"
              >
                <Pencil size={11} />
                編集
              </button>
              <button
                onClick={() => {
                  const next = !showAbnOnly;
                  setShowAbnOnly(next);
                  const q = [next ? "abn=1" : "", showRequiredOnly ? "req=1" : ""].filter(Boolean).join("&");
                  router.replace(q ? `/record/${date}?${q}` : `/record/${date}`, { scroll: false });
                }}
                className={`flex flex-1 items-center justify-center gap-1 py-1 rounded-full text-xs font-medium border transition ${
                  showAbnOnly ? "bg-red-50 text-red-700 border-red-300" : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                <AlertCircle size={11} />
                閾値外
              </button>
              <button
                onClick={() => {
                  const next = !showRequiredOnly;
                  setShowRequiredOnly(next);
                  const q = [showAbnOnly ? "abn=1" : "", next ? "req=1" : ""].filter(Boolean).join("&");
                  router.replace(q ? `/record/${date}?${q}` : `/record/${date}`, { scroll: false });
                }}
                className={`flex flex-1 items-center justify-center gap-1 py-1 rounded-full text-xs font-medium border transition ${
                  showRequiredOnly ? "bg-red-50 text-red-700 border-red-300" : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                <Star size={11} className={showRequiredOnly ? "fill-yellow-400 text-yellow-400" : ""} />
                注目
              </button>
            </div>
            {needsScroll && (
              <div className="flex justify-end mt-1">
                <button
                  onClick={() => aiSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="flex items-center gap-0.5 text-[11px] text-gray-400 py-0.5"
                >
                  <ChevronUp size={11} className="rotate-180" />
                  AI分析へ
                </button>
              </div>
            )}
          </div>
        )}

        {!record ? (
          <div className="text-center py-20 text-gray-400">
            <p>この日の記録が見つかりません</p>
          </div>
        ) : (
          <>
            <div ref={topRef} />
            <DraggableItemList
              items={filteredItems}
              record={record}
              onReorder={handleReorder}
              filteredIds={filteredItems.map(i => i.id)}
            />

            {/* AI チャットセクション */}
            <div ref={aiSectionRef} className="mt-0 mb-2">
              <div className="bg-white border-t-2 border-red-100 overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50">
                  {/* タイトル行 */}
                  <div className="relative flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-red-500" />
                      <h2 className="text-base font-semibold text-gray-700">AI分析</h2>
                    </div>
                    <div className="absolute right-0 flex items-center gap-2">
                      {aiMessages.length > 0 && !aiSelectMode && (
                        <button
                          onClick={() => { setAiSelectMode(true); setAiSelected(new Set()); }}
                          className="flex items-center gap-0.5 text-[11px] text-gray-400 py-0.5"
                        >
                          <Trash2 size={11} />
                          選択
                        </button>
                      )}
                      {needsScroll && !aiSelectMode && (
                        <button
                          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                          className="flex items-center gap-0.5 text-[11px] text-gray-400 py-0.5"
                        >
                          <ChevronUp size={11} />
                          先頭へ
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 選択モードの操作バー */}
                  {aiSelectMode && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">{aiSelected.size}件選択中</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAiSelectMode(false); setAiSelected(new Set()); }}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => setConfirmAiDelete(true)}
                          disabled={aiSelected.size === 0}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded-full disabled:opacity-40"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                  {/* この記録を分析するボタン: 中央寄せ */}
                  {aiMessages.length === 0 && (
                    <div className="flex justify-center mt-2">
                      <button
                        onClick={() => handleAiAnalyze(null)}
                        disabled={aiLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full disabled:opacity-50"
                      >
                        <Sparkles size={12} />
                        {aiLoading ? "分析中..." : "この記録を分析する"}
                      </button>
                    </div>
                  )}
                </div>

                {/* 会話履歴 */}
                {aiMessages.length > 0 && (
                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                    {aiMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        onClick={() => {
                          if (!aiSelectMode) return;
                          setAiSelected(prev => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          });
                        }}
                      >
                        {aiSelectMode && (
                          <div className="shrink-0 mt-1">
                            {aiSelected.has(i)
                              ? <CheckCircle2 size={18} className="text-red-500" />
                              : <Circle size={18} className="text-gray-300" />}
                          </div>
                        )}
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          aiSelectMode && aiSelected.has(i) ? "opacity-50" : ""
                        } ${
                          msg.role === "user"
                            ? "bg-red-600 text-white rounded-br-sm"
                            : "bg-gray-100 text-gray-800 rounded-bl-sm"
                        }`}>
                          {msg.role === "user" ? (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          ) : (
                            <ReactMarkdown
                              allowedElements={["p", "strong", "em", "ul", "ol", "li", "br", "h3", "hr"]}
                              unwrapDisallowed
                              components={{
                                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                                li: ({ children }) => <li>{children}</li>,
                                h3: ({ children }) => <h3 className="text-base font-bold text-gray-800 mt-3 mb-0.5 pt-2 border-t border-gray-300 first:mt-0 first:pt-0 first:border-t-0">{children}</h3>,
                                hr: () => <hr className="border-t border-gray-300 my-2" />,
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
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 w-full"
              />
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

    </div>
  );
}
