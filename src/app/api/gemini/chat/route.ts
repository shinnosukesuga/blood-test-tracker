import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { BloodRecord, ItemMaster, AIMessage } from "@/lib/types";

function buildSeasonalContext(
  currentDate: string,
  allRecords: BloodRecord[],
  items: ItemMaster[],
  seasonalYears: number
): string {
  const [yearStr, monthStr] = currentDate.split("-");
  const currentYear = parseInt(yearStr);
  const currentMonth = parseInt(monthStr);

  const seasonal = allRecords.filter((r) => {
    const [ry, rm] = r.date.split("-").map(Number);
    if (ry >= currentYear) return false;
    if (ry < currentYear - seasonalYears) return false;
    const diff = Math.abs(rm - currentMonth);
    return diff <= 1 || diff >= 11;
  });

  if (seasonal.length === 0) return "";

  const formatRecord = (r: BloodRecord) =>
    Object.entries(r.values)
      .map(([id, val]) => {
        const item = items.find((i) => i.id === id);
        return `${item?.name ?? id}: ${val} ${item?.unit ?? ""}`;
      })
      .join(", ");

  return seasonal
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => `[${r.date}] ${formatRecord(r)}`)
    .join("\n");
}

function filterTargetItems(
  currentRecord: BloodRecord,
  previousRecord: BloodRecord | null,
  items: ItemMaster[]
): ItemMaster[] {
  return items.filter((item) => {
    const val = currentRecord.values[item.id];
    if (val === undefined) return false;

    const { min, max } = item.range;
    const isOutOfRange = (max !== null && val > max) || (min !== null && val < min);
    if (isOutOfRange) return true;

    const nearThreshold =
      (max !== null && val >= max * 0.9) ||
      (min !== null && min > 0 && val <= min * 1.1);
    if (!nearThreshold) return false;

    const prevVal = previousRecord?.values[item.id];
    if (prevVal === undefined || prevVal === 0) return false;
    return Math.abs((val - prevVal) / prevVal) >= 0.05;
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini APIキーが設定されていません" }, { status: 500 });
  }

  const { currentRecord, recentRecords, allRecords, items, conversationHistory, userMessage, seasonalYears } =
    await req.json() as {
      currentRecord: BloodRecord;
      recentRecords: BloodRecord[];
      allRecords: BloodRecord[];
      items: ItemMaster[];
      conversationHistory: AIMessage[];
      userMessage: string | null;
      seasonalYears: number;
    };

  const ai = new GoogleGenAI({ apiKey });
  const previousRecord = recentRecords[0] ?? null;

  const targetItems = userMessage === null
    ? filterTargetItems(currentRecord, previousRecord, items)
    : items;

  const formatValues = (values: Record<string, number>, itemList: ItemMaster[]) =>
    itemList
      .filter((i) => values[i.id] !== undefined)
      .map((i) => {
        const val = values[i.id];
        const { min, max } = i.range;
        const isOut = (max !== null && val > max) || (min !== null && val < min);
        const nearTop = max !== null && val >= max * 0.9 && val <= max;
        const nearBot = min !== null && min > 0 && val <= min * 1.1 && val >= min;
        const tag = isOut ? "【閾値超過】" : nearTop ? "【上限付近】" : nearBot ? "【下限付近】" : "";
        return `${i.name}: ${val} ${i.unit} (基準: ${min ?? "-"}〜${max ?? "-"})${tag}`;
      })
      .join("\n");

  const targetInfo = targetItems.length > 0
    ? formatValues(currentRecord.values, targetItems)
    : "（注目すべき項目なし）";

  const prevInfo = previousRecord
    ? formatValues(previousRecord.values, targetItems.filter((i) => previousRecord.values[i.id] !== undefined))
    : "（なし）";

  const seasonalContext = buildSeasonalContext(currentRecord.date, allRecords, items, seasonalYears);

  const systemPrompt = `あなたは血液検査データを解説する医療情報AIです（診断はしません）。

## 分析対象項目（${currentRecord.date}）
※「閾値超過」または「閾値前後10%かつ前回比5%以上変動」の項目のみ抽出済み
${targetInfo}

## 前回値（参考）
${prevInfo}

## 同時期の過去データ（季節傾向）
${seasonalContext || "（なし）"}

## 分析ルール（厳守）
- 上記の分析対象項目についてのみ言及する
- 対象外の項目は一切触れない（「〜は安定」「その他は正常」などの列挙も不要）
- 対象項目がゼロの場合のみ「数値は安定しています」の1文で終了
- 対策は対象項目に対してのみ、食事・運動・生活習慣から具体的に3つ以内
- 季節傾向と比較して異常な変化があれば指摘

## 応答フォーマット（厳守）
- 項目名は必ず **太文字** にする（例: **γ-GTP**）
- 各項目のブロックは必ず `### 項目名` の見出しで始める
- 見出しの直後には空行を入れない（見出し→本文を続ける）
- 各項目ブロックの間には必ず空行を1行入れる
- 箇条書き（-）は対策リストのみ使用可。説明文は自然な文章で書く
- 余計な前置き・締めくくりの定型文は不要

## 応答スタイル
- 簡潔・実用的な日本語で回答
- 会話形式の自然な文章で返答`;

  const historyContents = conversationHistory.map((m) => ({
    role: m.role === "ai" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "了解しました。血液検査データを分析します。" }] },
      ...historyContents,
      { role: "user", parts: [{ text: userMessage ?? "この検査結果を分析してください。" }] },
    ],
  });

  return NextResponse.json({ text: response.text ?? "応答を取得できませんでした" });
}
