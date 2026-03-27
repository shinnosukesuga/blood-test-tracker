import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, BloodRecord, ItemMaster } from "@/lib/types";

const ANALYSIS_PROMPT = (itemsInfo: string, current: string, previous: string) => `
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
- insights・recommendations で検査項目名を出す際は「項目名（何を測る指標か10字以内）」の形式にする。例：「HbA1c（血糖の長期管理指標）」「中性脂肪（血中の脂質量）」
- 文体：ですます調は使わない。体言止めや短文で簡潔に
- 末尾の句点（。）は不要

以下のJSON形式のみで返せ:
{
  "summary": "概要文",
  "insights": ["示唆1", "示唆2"],
  "recommendations": ["対策1", "対策2", "対策3"],
  "hasSignificantChanges": true/false
}
`.trim();

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini APIキーが設定されていません" }, { status: 500 });
  }

  const { currentRecord, previousRecord, items } = await req.json() as {
    currentRecord: BloodRecord;
    previousRecord: BloodRecord | null;
    items: ItemMaster[];
  };

  if (!previousRecord) {
    const result: AIAnalysis = {
      summary: "前回データがないため比較できません。初回登録として記録しました。",
      insights: [],
      recommendations: [],
      hasSignificantChanges: false,
    };
    return NextResponse.json(result);
  }

  const ai = new GoogleGenAI({ apiKey });

  const itemsInfo = items
    .map((i) => `${i.name}(${i.id}): 基準値 ${i.range.min ?? "-"}〜${i.range.max ?? "-"} ${i.unit}`)
    .join("\n");

  const formatRecord = (r: BloodRecord) =>
    Object.entries(r.values)
      .map(([id, val]) => {
        const item = items.find((i) => i.id === id);
        return `${item?.name ?? id}: ${val} ${item?.unit ?? ""}`;
      })
      .join("\n");

  const prompt = ANALYSIS_PROMPT(
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
    const fallback: AIAnalysis = {
      summary: "分析結果のパースに失敗しました",
      insights: [],
      recommendations: [],
      hasSignificantChanges: false,
    };
    return NextResponse.json(fallback);
  }

  return NextResponse.json(JSON.parse(jsonMatch[0]) as AIAnalysis);
}
