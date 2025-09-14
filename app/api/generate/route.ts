import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const {
      mode,
      destination,
      days,
      transport,
      startTime,
      endTime,
      spots, // 旧仕様互換（使わない場合あり）
    } = body as {
      mode?: "destination" | "spots";
      destination?: string;
      days?: number;
      transport?: "walk" | "public";
      startTime?: string;
      endTime?: string;
      spots?: { name: string; lat: number; lng: number }[];
    };

    if (!days || days < 1) {
      return NextResponse.json({ error: "days が不正です。" }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime || "") || !/^\d{2}:\d{2}$/.test(endTime || "") || (startTime as string) >= (endTime as string)) {
      return NextResponse.json({ error: "時刻指定が不正です。" }, { status: 400 });
    }

    const system =
      "あなたは旅行プランナーです。回答は日本語のMarkdownで、冗長になりすぎないように構成します。" +
      "各日の開始〜終了はユーザー指定の時間帯を厳守してください。" +
      "移動のひとこと（徒歩/公共交通）を含め、必要に応じて以下の補足情報を“出せる範囲で”追加してください：" +
      "食事/カフェ、滞在時間・モデルルート、見どころ/体験、実用情報（移動/混雑/費用）、季節/天候アドバイス。";

    let user = "";

    if (mode === "destination") {
      if (!destination || !destination.trim()) {
        return NextResponse.json({ error: "destination が未指定です。" }, { status: 400 });
      }
      // ★ 行き先ベース：スポット選定から行程作成までAIに任せる
      user =
        `前提:\n` +
        `- 行き先: ${destination.trim()}\n` +
        `- 総日数: ${days}日\n` +
        `- 各日の時間帯: ${startTime}〜${endTime}\n` +
        `- 移動手段: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
        `\n要件:\n` +
        `- 行き先エリアで訪れる価値のあるスポットや飲食店を、地理的な近さ・回遊効率を考慮して選定してください。\n` +
        `- 各日セクションは以下のフォーマットで出力してください。\n` +
        `\n出力フォーマット（Markdown）例:\n` +
        `## 日1 行程（${startTime}〜${endTime}）\n` +
        `- ルート: A → B → C\n` +
        `- メモ: 移動のひとこと（徒歩/公共交通）\n` +
        `\n### 補足情報（出せる範囲で）\n` +
        `- 食事・カフェ情報（ランチ/ディナー候補）\n` +
        `- 滞在時間・モデルルート（各スポットの目安）\n` +
        `- 観光・体験ポイント\n` +
        `- 実用情報（移動/混雑/費用）\n` +
        `- 季節・天候アドバイス\n`;
    } else {
      // ★ 従来のスポット固定版（互換維持）
      if (!Array.isArray(spots) || spots.length === 0) {
        return NextResponse.json({ error: "spots が空です。" }, { status: 400 });
      }
      user =
        `前提:\n` +
        `- 総日数: ${days}日\n` +
        `- 各日の時間帯: ${startTime}〜${endTime}\n` +
        `- 移動手段: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
        `- 利用可能スポット:\n` +
        spots.map((s, i) => `  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`).join("\n") +
        `\n\n要件:\n` +
        `- 指定スポットのみで日程を構成。近接順にまとめて効率的な動線にする。\n` +
        `- 出力フォーマットは行き先版と同様。`;
    }

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
