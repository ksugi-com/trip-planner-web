import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Spot = { name: string; lat: number; lng: number };

export async function POST(req: NextRequest) {
  try {
    const { transport, spots } = (await req.json()) as {
      transport: "walk" | "public";
      spots: Spot[];
    };

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

    // ✅ 「出せる範囲だけ、無ければスキップ」を明示
    const system =
      "あなたは旅行プランナーです。入力されたスポットのみを使って、その日の実行可能な行程案を日本語で作成します。" +
      "情報が不足している項目は無理に推測せずスキップしてください（'不明'や空欄を埋めない）。" +
      "回答は読みやすい Markdown で、冗長になりすぎないように。";

    const sectionsGuidance =
      "- 1. 食事・カフェ情報（地元人気・名物、休憩スポット、ランチ/ディナー候補を時間帯に合わせて複数）\n" +
      "- 2. 滞在時間・モデルルート（各スポットの平均滞在時間、午前/午後のモデルスケジュール）\n" +
      "- 3. 観光・体験ポイント（見どころ、体験アクティビティ）\n" +
      "- 4. 実用情報（移動手段の選択肢、混雑目安、費用目安）\n" +
      "- 5. 季節・天候アドバイス（季節のおすすめ、雨の日の代替案）";

    const user =
      `対象日: 1日\n` +
      `移動手段の想定: ${transport === "walk" ? "徒歩中心" : "公共交通/車"}\n` +
      `訪問スポット（順不同）:\n` +
      spots.map((s, i) => `  ${i + 1}. ${s.name} (${s.lat}, ${s.lng})`).join("\n") +
      `\n\n要件:\n` +
      `- 指定スポットのみを使う。\n` +
      `- 地理的な近さを意識して効率的な順番にする。\n` +
      `- 情報が無い補足はスキップ可（無理に埋めない）。\n` +
      `- 出力フォーマット（Markdown）:\n` +
      `## 日1 行程\n` +
      `- 時間目安: 09:00〜17:00\n` +
      `- ルート: A → B → C\n` +
      `- メモ: 移動のひとこと（徒歩/公共交通）\n\n` +
      `## 補足情報（出せる範囲で）\n` +
      sectionsGuidance;

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
