import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Spot = { name: string; lat: number; lng: number };

export async function POST(req: NextRequest) {
  try {
    const { days, transport, startTime, endTime, spots } = (await req.json()) as {
      days: number;
      transport: "walk" | "public";
      startTime: string; // "HH:MM"
      endTime: string;   // "HH:MM"
      spots: Spot[];
    };

    if (!days || days < 1) {
      return NextResponse.json({ error: "days が不正です。" }, { status: 400 });
    }
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
      "あなたは旅行プランナーです。ユーザーの保存スポットだけを使って、日数に応じた実行可能な日別行程を日本語で作成します。" +
      "各日の開始〜終了時間はユーザー指定の時間帯を厳守してください。訪問順や移動のひとこと（徒歩/公共交通）を含め、" +
      "補足情報（出せる範囲で可）：食事/カフェ、滞在時間とモデルルート、見どころ/体験、実用情報（移動/混雑/費用）、季節/天候アドバイス。" +
      "回答は読みやすいMarkdownで、冗長になりすぎないように。";

    const user =
      `前提:\n` +
      `- 日数: ${days}日\n` +
      `- 移動手段: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
      `- 各日の時間帯: ${startTime}〜${endTime}\n` +
      `- スポット一覧:\n` +
      spots.map((s, i) => `  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`).join("\n") +
      `\n\n要件:\n` +
      `- 指定スポットのみを使う（足りない日は近隣散策や休憩で調整可）。\n` +
      `- 地理的な近さを意識して同日にまとめ、効率的な順番を提案。\n` +
      `- 出力フォーマット（Markdown）例:\n` +
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
