"use client";

import { useState } from "react";

export default function PlanGenerator() {
  const [destination, setDestination] = useState(""); // ★ 行き先
  const [days, setDays] = useState(2);               // ★ 総日数
  const [transport, setTransport] = useState<"walk" | "public">("public");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [planText, setPlanText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setPlanText("");

    if (!destination.trim()) {
      setError("行き先を入力してください（例：京都、台北、パリなど）。");
      return;
    }
    if (!days || days < 1) {
      setError("総日数は1以上で指定してください。");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      setError("時刻は HH:MM 形式で指定してください。");
      return;
    }
    if (startTime >= endTime) {
      setError("開始時刻は終了時刻より前にしてください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "destination", // ★ 行き先ベースで生成
          destination,
          days,
          transport,
          startTime,
          endTime,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(`生成エラー (${res.status}): ${text || "原因不明"}`);
        return;
      }

      const data = await res.json().catch(() => ({} as any));
      if (!data?.plan) {
        setError("プランの生成に失敗しました。（planが空）");
        return;
      }
      setPlanText(data.plan);
    } catch (e: any) {
      setError(`通信エラー: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full border rounded-lg p-3 space-y-3">
      <h2 className="font-semibold">全日程プラン生成</h2>

      <div className="flex flex-col gap-3">
        <label className="text-sm">行き先</label>
        <input
          type="text"
          placeholder="例：京都 / 台北 / パリ"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="border p-2 rounded w-full"
        />
        <p className="text-xs text-gray-500 mt-1">
          ※ 精度を上げたい場合は「エリアの粒度」や「テーマ」を追加すると効果的です。<br />
          例）「京都 市内中心」「ソウル カフェ巡り」「パリ 美術館中心」
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">総日数</label>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
            className="border p-2 rounded w-24"
          />

          <label className="text-sm">移動手段</label>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as "walk" | "public")}
            className="border p-2 rounded"
          >
            <option value="public">公共交通/車前提</option>
            <option value="walk">徒歩中心</option>
          </select>

          <label className="text-sm">開始</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="border p-2 rounded"
          />

          <label className="text-sm">終了</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="border p-2 rounded"
          />

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {loading ? "生成中..." : "プランを生成"}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {planText && (
        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border">
          {planText}
        </pre>
      )}
    </div>
  );
}
