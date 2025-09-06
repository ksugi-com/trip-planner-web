import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Spot = { name: string; lat: number; lng: number };

export async function POST(req: NextRequest) {
  try {
    const { days, transport, spots } = (await req.json()) as {
      days: number;
      transport: "walk" | "public";
      spots: Spot[];
    };

    if (!days || days < 1) {
      return NextResponse.json({ error: "days が不正です。" }, { status: 400 });
    }
    if (!Array.isArray(spots) || spots.length === 0) {
      return NextResponse.json({ error: "spots が空です。" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const system =
      "あなたは旅行プランナーです。ユーザーの保存スポットだけを使って、日数に応じた実行可能な日別行程を日本語で作成します。各日の開始〜終了時間目安、訪問順、移動のひとこと（徒歩/公共交通の想定）を含めてください。最後に全体の注意点を3つ以内で。";

    const user =
      `前提:\n` +
      `- 日数: ${days}日\n` +
      `- 移動手段: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
      `- スポット一覧:\n` +
      spots
        .map((s, i) => `  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`)
        .join("\n") +
      `\n\n要件:\n` +
      `- 指定スポットのみを使う（足りない日は休憩などでも可）\n` +
      `- 地理的に近いものをまとめて1日内で回す\n` +
      `- 出力フォーマット:\n` +
      `日X:\n  - 09:00 〜 17:00（目安）\n  - ルート: A → B → C\n  - メモ: ...`;

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
