import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GeminiScanResult } from "@/lib/types";

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini APIキーが設定されていません" }, { status: 500 });
  }

  const { imageBase64, mimeType } = await req.json() as { imageBase64: string; mimeType: string };

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { text: SCAN_PROMPT },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Gemini からの応答をパースできませんでした" }, { status: 500 });
  }

  const result = JSON.parse(jsonMatch[0]) as GeminiScanResult;
  return NextResponse.json(result);
}
