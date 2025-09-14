import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Spot = { name: string; lat: number; lng: number };

export async function POST(req: NextRequest) {
  try {
    const { transport, startTime, endTime, spots } = (await req.json()) as {
      transport: "walk" | "public";
      startTime: string; // "HH:MM"
      endTime: string;   // "HH:MM"
      spots: Spot[];
    };

    if (!Array.isArray(spots) || spots.length === 0) {
      return NextResponse.json({ error: "spots が空です。" }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
      return NextResponse.json({ error: "時刻指定が不正です。" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const system =
      "あなたは旅行プランナーです。入力されたスポットのみを使って、その日の実行可能な行程案を日本語で作成します。" +
      "開始〜終了の時間帯はユーザー指定を厳守してください。移動のひとこと（徒歩/公共交通）を含め、" +
      "補足情報（出せる範囲で）：食事/カフェ、滞在時間・モデルルート、見どころ/体験、実用情報（移動/混雑/費用）、季節/天候アドバイス。" +
      "回答は読みやすいMarkdownで。";

    const user =
      `対象日: 1日\n` +
      `移動手段の想定: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
      `この日の時間帯: ${startTime}〜${endTime}\n` +
      `訪問スポット（順不同）:\n` +
      spots.map((s, i) => `  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`).join("\n") +
      `\n\n出力フォーマット（Markdown）例:\n` +
      `## 日1 行程\n` +
      `- 時間目安: ${startTime}〜${endTime}\n` +
      `- ルート: A → B → C\n` +
      `- メモ: ...\n\n` +
      `## 補足情報（出せる範囲で）\n` +
      `- 食事・カフェ情報\n- 滞在時間・モデルルート\n- 観光・体験ポイント\n- 実用情報（移動/混雑/費用）\n- 季節・天候アドバイス`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: "OpenAI API 呼び出しエラー", detail: text },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const plan = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ plan });
  } catch (e: any) {
    return NextResponse.json(
      { error: "サーバエラー", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
