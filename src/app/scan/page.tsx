"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, ChevronLeft, Check, X, Sparkles, AlertTriangle, PenLine } from "lucide-react";
import { GeminiScanResult, BloodRecord } from "@/lib/types";
import { loadItems, saveRecord, generateId } from "@/lib/storage";
import DatePicker from "@/components/DatePicker";
import { scanImageWithGemini, fileToBase64, analyzeRecords } from "@/lib/gemini";
import { isAbnormal, findItem } from "@/lib/itemMaster";
import { loadRecords, getPreviousRecord } from "@/lib/storage";
import { sanitizeNum } from "@/lib/utils";

// 入力フィールド（1項目）
interface ScanItem {
  itemId: string;
  name: string;
  alias: string;
  value: number;
  unit: string;
  rangeMin: number | null;
  rangeMax: number | null;
}

export default function ScanPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "review" | "saving" | "done">("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [scanDate, setScanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAbnormalOnly, setShowAbnormalOnly] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setScanError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setScanning(true);

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";
      const result: GeminiScanResult = await scanImageWithGemini(base64, mimeType);

      if (result.date) setScanDate(result.date);

      const items = loadItems();
      const mapped: ScanItem[] = result.items.map((r) => {
        const matched = findItem(items, r.name) ?? findItem(items, r.alias ?? "");
        return {
          itemId: matched?.id ?? r.alias ?? r.name,
          name: matched?.name ?? r.name,
          alias: matched?.aliases[1] ?? r.alias ?? "",
          value: r.value,
          unit: r.unit ?? matched?.unit ?? "",
          rangeMin: r.rangeMin ?? matched?.range.min ?? null,
          rangeMax: r.rangeMax ?? matched?.range.max ?? null,
        };
      });

      setScanItems(mapped);
      setStep("review");
    } catch (err) {
      setScanError(`スキャンエラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const updateValue = (idx: number, value: string) => {
    const sanitized = sanitizeNum(value);
    setScanItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, value: parseFloat(sanitized) || 0 } : item
      )
    );
  };

  const removeItem = (idx: number) => {
    setScanItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setStep("saving");

    const values: Record<string, number> = {};
    for (const item of scanItems) {
      values[item.itemId] = item.value;
    }

    const record: BloodRecord = {
      id: generateId(),
      date: scanDate,
      values,
      createdAt: new Date().toISOString(),
    };

    saveRecord(record);

    // AI 分析
    try {
      const items = loadItems();
      const prev = getPreviousRecord(scanDate);
      {
        const analysis = await analyzeRecords(record, prev, items);
        if (analysis.hasSignificantChanges) {
          setAiAnalysis(
            [analysis.summary, ...analysis.insights, ...analysis.recommendations.map((r) => `• ${r}`)].join("\n")
          );
        } else {
          setAiAnalysis(analysis.summary);
        }
      }
    } catch {
      // 分析は任意なのでエラーは無視
    }

    setStep("done");
  };

  const filteredItems = showAbnormalOnly
    ? scanItems.filter((item) => {
        if (item.rangeMin !== null && item.value < item.rangeMin) return true;
        if (item.rangeMax !== null && item.value > item.rangeMax) return true;
        return false;
      })
    : scanItems;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-lg font-bold">AIスキャン</h1>
            <p className="text-red-200 text-xs">画像から検査値を自動読み取り</p>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-8">
        {/* アップロードステップ */}
        {step === "upload" && (
          <div className="p-6">
            {scanError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {scanError}
              </div>
            )}

            {scanning ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <Sparkles size={28} className="text-red-500 animate-pulse" />
                </div>
                <p className="text-lg font-semibold text-gray-700">AIが解析中...</p>
                <p className="text-sm text-gray-400 mt-1">しばらくお待ちください</p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="スキャン画像"
                    className="w-full rounded-xl shadow object-contain max-h-48"
                  />
                )}

                <button
                  onClick={() => cameraRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 p-4 bg-red-600 text-white rounded-2xl font-semibold shadow hover:bg-red-700 active:scale-95 transition"
                >
                  <Camera size={22} />
                  カメラで撮影
                </button>

                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 p-4 bg-white text-gray-700 rounded-2xl font-semibold shadow border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                >
                  <Upload size={22} />
                  ギャラリーから選択
                </button>

                <p className="text-center text-xs text-gray-400">
                  検査結果の写真や画像を選択してください
                </p>

                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">または</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  onClick={() => router.replace("/?manual=1")}
                  className="w-full flex items-center justify-center gap-3 p-4 bg-gray-50 text-gray-500 rounded-2xl font-medium border border-gray-200 hover:bg-gray-100 active:scale-95 transition"
                >
                  <PenLine size={20} />
                  手動で入力する
                </button>
              </div>
            )}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* レビューステップ */}
        {step === "review" && (
          <div>
            {/* 検査日 */}
            <div className="bg-white px-4 py-3 border-b border-gray-200">
              <label className="text-xs text-gray-500 font-medium">検査日</label>
              <button
                onClick={() => setShowDatePicker(true)}
                className="block w-full mt-1 text-base font-semibold text-gray-800 text-left"
              >
                {scanDate || "日付を選択"}
              </button>
              {showDatePicker && (
                <DatePicker
                  value={scanDate}
                  onChange={setScanDate}
                  onClose={() => setShowDatePicker(false)}
                />
              )}
            </div>

            {/* フィルター */}
            <div className="px-4 py-2 flex items-center justify-between bg-gray-50 border-b border-gray-100">
              <span className="text-sm text-gray-600">
                {scanItems.length}項目を読み取りました
              </span>
              <button
                onClick={() => setShowAbnormalOnly((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition ${
                  showAbnormalOnly
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                閾値外のみ
              </button>
            </div>

            {/* 項目リスト */}
            <div className="bg-white divide-y divide-gray-100">
              {filteredItems.map((item, idx) => {
                const realIdx = scanItems.indexOf(item);
                const isLow = item.rangeMin !== null && item.value < item.rangeMin;
                const isHigh = item.rangeMax !== null && item.value > item.rangeMax;
                const abnormal = isLow || isHigh;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-center px-4 py-2.5 ${abnormal ? "bg-red-50" : ""}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-sm font-medium ${abnormal ? "text-red-700" : "text-gray-800"}`}>
                          {item.name}
                        </span>
                        {item.alias && (
                          <span className="text-xs text-gray-400">{item.alias}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        基準: {item.rangeMin ?? "—"}〜{item.rangeMax ?? "—"} {item.unit}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.value}
                        onChange={(e) => updateValue(realIdx, e.target.value)}
                        className={`w-20 text-right text-base font-bold rounded-lg px-2 py-1 border outline-none ${
                          abnormal
                            ? "text-red-600 border-red-300 bg-red-50"
                            : "text-gray-800 border-gray-200 bg-white"
                        }`}
                      />
                      <span className="text-xs text-gray-400 w-10">{item.unit}</span>
                      {abnormal && (
                        <span className="text-[10px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                          {isLow ? "低" : "高"}
                        </span>
                      )}
                      <button
                        onClick={() => removeItem(realIdx)}
                        className="text-gray-300 hover:text-red-400 transition ml-1"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* 保存ボタン */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
              <div className="max-w-md mx-auto flex gap-3">
                <button
                  onClick={() => { setStep("upload"); setScanItems([]); }}
                  className="flex-none px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium"
                >
                  撮り直す
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-semibold shadow hover:bg-red-700 active:scale-95 transition"
                >
                  <Check size={20} />
                  保存する ({scanItems.length}件)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 保存中 */}
        {step === "saving" && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <Sparkles size={28} className="text-red-500 animate-pulse" />
            </div>
            <p className="text-lg font-semibold text-gray-700">保存中...</p>
            <p className="text-sm text-gray-400 mt-1">AI分析を実行しています</p>
          </div>
        )}

        {/* 完了 */}
        {step === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 text-center"
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={36} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">保存完了</h2>
            <p className="text-sm text-gray-500 mb-6">{scanDate} の記録を保存しました</p>

            {aiAnalysis && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-left mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-blue-500" />
                  <span className="text-sm font-semibold text-blue-700">AI分析</span>
                </div>
                <p className="text-sm text-blue-800 whitespace-pre-line leading-relaxed">
                  {aiAnalysis}
                </p>
              </div>
            )}

            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold shadow hover:bg-red-700 transition"
            >
              記録一覧へ
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
