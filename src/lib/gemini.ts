import { GoogleGenAI } from "@google/genai";
import { GeminiScanResult, AIAnalysis, AIMessage, BloodRecord, ItemMaster } from "./types";

// env変数優先、なければsettingsのキーを使う
export function resolveApiKey(settingsKey: string): string {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || settingsKey;
}

// ============================================================
// 画像スキャン: 血液検査結果 → 構造化データ
// ============================================================

const SCAN_PROMPT = `
あなたは血液検査結果を読み取るAIアシスタントです。
この画像から血液検査の各項目と数値を抽出してください。

以下のJSON形式で返してください（JSON以外は一切出力しないこと）:
{
  "date": "YYYY-MM-DD または null",
  "items": [
    {
      "name": "項目名（日本語）",
      "alias": "略称（例: AST）",
      "value": 数値,
      "unit": "単位",
      "rangeMin": 基準値下限または null,
      "rangeMax": 基準値上限または null
    }
  ],
  "rawText": "画像から読み取ったテキスト全文"
}
`.trim();

export async function scanImageWithGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<GeminiScanResult> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: SCAN_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
  });

  const text = response.text ?? "";
  // JSON 部分のみ抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini からの応答をパースできませんでした");
  }

  const parsed = JSON.parse(jsonMatch[0]) as GeminiScanResult;
  return parsed;
}

// ============================================================
// AI 分析: 前回比較 → 示唆出し（ノイズ除去付き）
// ============================================================

const ANALYSIS_PROMPT_TEMPLATE = (
  itemsInfo: string,
  current: string,
  previous: string
) => `
あなたは医療情報の解説AIです（診断はしません）。

## 現在の検査結果
${current}

## 前回の検査結果
${previous}

## 基準値情報
${itemsInfo}

## 指示（厳守）
- 言及してよい項目：「前回比5%以上の変動」かつ「基準値外」の項目のみ
- 基準値内の項目は一切言及しない。「〜は安定しています」「〜は正常範囲内です」の形でも列挙しない
- 正常項目をまとめて「その他の項目は基準値内です」のような文も不要
- 言及すべき項目がゼロの場合のみ summary に「数値は安定しています」と1文で記載
- insights には言及した項目に対する具体的対策（食事・運動・生活習慣）を3つ以内
- hasSignificantChanges は言及すべき項目があるかどうか

以下のJSON形式のみで返せ:
{
  "summary": "概要文",
  "insights": ["示唆1", "示唆2"],
  "recommendations": ["対策1", "対策2", "対策3"],
  "hasSignificantChanges": true/false
}
`.trim();

export async function analyzeRecords(
  apiKey: string,
  currentRecord: BloodRecord,
  previousRecord: BloodRecord | null,
  items: ItemMaster[]
): Promise<AIAnalysis> {
  if (!previousRecord) {
    return {
      summary: "前回データがないため比較できません。初回登録として記録しました。",
      insights: [],
      recommendations: [],
      hasSignificantChanges: false,
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  const itemsInfo = items
    .map(
      (i) =>
        `${i.name}(${i.id}): 基準値 ${i.range.min ?? "-"}〜${i.range.max ?? "-"} ${i.unit}`
    )
    .join("\n");

  const formatRecord = (r: BloodRecord) =>
    Object.entries(r.values)
      .map(([id, val]) => {
        const item = items.find((i) => i.id === id);
        return `${item?.name ?? id}: ${val} ${item?.unit ?? ""}`;
      })
      .join("\n");

  const prompt = ANALYSIS_PROMPT_TEMPLATE(
    itemsInfo,
    `日付: ${currentRecord.date}\n${formatRecord(currentRecord)}`,
    `日付: ${previousRecord.date}\n${formatRecord(previousRecord)}`
  );

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      summary: "分析結果のパースに失敗しました",
      insights: [],
      recommendations: [],
      hasSignificantChanges: false,
    };
  }

  return JSON.parse(jsonMatch[0]) as AIAnalysis;
}

// ============================================================
// AI チャット: 季節コンテキスト + 会話履歴付き分析
// ============================================================

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
    if (ry >= currentYear) return false; // 当年はスキップ
    if (ry < currentYear - seasonalYears) return false;
    const diff = Math.abs(rm - currentMonth);
    return diff <= 1 || diff >= 11; // ±1ヶ月（12月/1月の境界対応）
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

// 分析対象項目を事前フィルタリング
// 条件: (1) 閾値超過 OR (2) 閾値前後10%以内 かつ 前回比5%以上
function filterTargetItems(
  currentRecord: BloodRecord,
  previousRecord: BloodRecord | null,
  items: ItemMaster[]
): ItemMaster[] {
  return items.filter((item) => {
    const val = currentRecord.values[item.id];
    if (val === undefined) return false;

    const { min, max } = item.range;

    // 条件1: 閾値超過
    const isOutOfRange =
      (max !== null && val > max) ||
      (min !== null && val < min);
    if (isOutOfRange) return true;

    // 条件2: 閾値前後10% かつ 前回比5%以上
    const nearThreshold =
      (max !== null && val >= max * 0.9) ||
      (min !== null && min > 0 && val <= min * 1.1);

    if (!nearThreshold) return false;

    const prevVal = previousRecord?.values[item.id];
    if (prevVal === undefined || prevVal === 0) return false;
    const changeRate = Math.abs((val - prevVal) / prevVal);
    return changeRate >= 0.05;
  });
}

export async function analyzeWithContext(
  apiKey: string,
  currentRecord: BloodRecord,
  recentRecords: BloodRecord[],   // 直近N件（現在を除く）
  allRecords: BloodRecord[],       // 季節コンテキスト用
  items: ItemMaster[],
  conversationHistory: AIMessage[], // 過去の会話履歴
  userMessage: string | null,       // nullなら初回分析、文字列ならユーザー返信
  seasonalYears: number = 2
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const previousRecord = recentRecords[0] ?? null;

  // 分析対象項目のみに絞る（初回分析時のみ。ユーザー返信時は全項目コンテキスト維持）
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
    ? formatValues(previousRecord.values, targetItems.filter(i => previousRecord.values[i.id] !== undefined))
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

## 応答スタイル
- 簡潔・実用的な日本語で回答
- 会話形式で返答（箇条書きより自然な文章を優先）
- 余計な前置き・締めくくりの定型文は不要`;

  // 会話履歴をGemini contents形式に変換
  const historyContents = conversationHistory.map((m) => ({
    role: m.role === "ai" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const currentMessage = userMessage ?? "この検査結果を分析してください。";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "了解しました。血液検査データを分析します。" }] },
      ...historyContents,
      { role: "user", parts: [{ text: currentMessage }] },
    ],
  });

  return response.text ?? "応答を取得できませんでした";
}

// ============================================================
// Helpers
// ============================================================

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64,XXX → XXX
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
