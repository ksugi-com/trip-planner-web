"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type { Bookmark } from "./BookmarkList";

type DaySpot = { bookmarkId: string; name: string; lat: number; lng: number; order: number };
type DayPlan = { day: number; spots: DaySpot[] };
type DayTime = { startTime: string; endTime: string };

export default function DayPlanner({
  user, // 使わないがシグネチャ互換のため残す
  bookmarks,
}: {
  user: User;
  bookmarks: Bookmark[];
}) {
  const [days, setDays] = useState(2);
  const [selectedDay, setSelectedDay] = useState(1);
  const [scheduleMap, setScheduleMap] = useState<Record<number, DayPlan>>({});
  const [generatedMap, setGeneratedMap] = useState<Record<number, string>>({});
  const [transport, setTransport] = useState<"walk" | "public">("public");

  // ★ 追加：各日の時間帯（デフォルト 09:00–17:00）
  const [timesMap, setTimesMap] = useState<Record<number, DayTime>>({
    1: { startTime: "09:00", endTime: "17:00" },
    2: { startTime: "09:00", endTime: "17:00" },
  });

  // days 変更時に枠を整える（プラン枠 & 時刻枠 & 生成結果枠）
  useEffect(() => {
    // プラン枠
    setScheduleMap((prev) => {
      const next: Record<number, DayPlan> = { ...prev };
      for (let d = 1; d <= days; d++) if (!next[d]) next[d] = { day: d, spots: [] };
      Object.keys(next).forEach((k) => Number(k) > days && delete next[Number(k)]);
      if (selectedDay > days) setSelectedDay(1);
      return next;
    });
    // 時刻枠
    setTimesMap((prev) => {
      const next: Record<number, DayTime> = { ...prev };
      for (let d = 1; d <= days; d++)
        if (!next[d]) next[d] = { startTime: "09:00", endTime: "17:00" };
      Object.keys(next).forEach((k) => Number(k) > days && delete next[Number(k)]);
      return next;
    });
    // 生成結果枠
    setGeneratedMap((prev) => {
      const next: Record<number, string> = {};
      for (let d = 1; d <= days; d++) if (prev[d]) next[d] = prev[d];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => i + 1), [days]);
  const currentDayPlan = scheduleMap[selectedDay] ?? { day: selectedDay, spots: [] };
  const currentTime = timesMap[selectedDay] ?? { startTime: "09:00", endTime: "17:00" };

  // --- 操作系 ---
  const addToDay = (b: Bookmark) => {
    setScheduleMap((prev) => {
      const target = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      if (target.spots.some((s) => s.bookmarkId === b.id)) return prev;
      const order = target.spots.length + 1;
      const added: DaySpot = { bookmarkId: b.id, name: b.name, lat: b.lat, lng: b.lng, order };
      return { ...prev, [selectedDay]: { ...target, spots: [...target.spots, added] } };
    });
  };

  const removeFromDay = (bookmarkId: string) => {
    setScheduleMap((prev) => {
      const t = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      const filtered = t.spots.filter((s) => s.bookmarkId !== bookmarkId)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...t, spots: filtered } };
    });
  };

  const moveUp = (idx: number) => {
    setScheduleMap((prev) => {
      const t = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      if (idx <= 0) return prev;
      const arr = [...t.spots];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      const normalized = arr.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...t, spots: normalized } };
    });
  };

  const moveDown = (idx: number) => {
    setScheduleMap((prev) => {
      const t = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      if (idx >= t.spots.length - 1) return prev;
      const arr = [...t.spots];
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      const normalized = arr.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...t, spots: normalized } };
    });
  };

  // --- 生成 ---
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const generateThisDay = async () => {
    setGenError(null);
    const spots = (scheduleMap[selectedDay]?.spots ?? []).map((s) => ({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    }));
    if (spots.length === 0) {
      setGenError("この日に割り当てられたスポットがありません。ブックマークから追加してください。");
      return;
    }
    const { startTime, endTime } = currentTime;
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
      setGenError("時刻指定が不正です（開始は終了より前、形式は HH:MM）。");
      return;
    }

    setGenLoading(true);
    try {
      const res = await fetch("/api/generate-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transport, startTime, endTime, spots }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setGenError(`生成エラー (${res.status}): ${text || "原因不明"}`);
        return;
      }
      const data = await res.json();
      const text = data.plan ?? "生成に失敗しました。";
      setGeneratedMap((prev) => ({ ...prev, [selectedDay]: text }));
    } catch (e: any) {
      setGenError(`通信エラー: ${e?.message ?? String(e)}`);
    } finally {
      setGenLoading(false);
    }
  };

  // --- UI ---
  return (
    <div className="w-full border rounded-lg p-3 space-y-4">
      <h2 className="font-semibold">日別プラン生成</h2>

      {/* 上部操作列（保存ボタンは削除済み） */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">総日数</label>
        <input
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(e) => setDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
          className="border p-2 rounded w-24"
        />

        <label className="text-sm">生成日</label>
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
          className="border p-2 rounded"
        >
          {dayList.map((d) => (
            <option key={d} value={d}>{`日 ${d}`}</option>
          ))}
        </select>

        <label className="text-sm">移動手段</label>
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as "walk" | "public")}
          className="border p-2 rounded"
        >
          <option value="public">公共交通/車前提</option>
          <option value="walk">徒歩中心</option>
        </select>

        {/* ★ 各日ごとの時間帯設定 */}
        <label className="text-sm">開始</label>
        <input
          type="time"
          value={currentTime.startTime}
          onChange={(e) =>
            setTimesMap((prev) => ({
              ...prev,
              [selectedDay]: { ...currentTime, startTime: e.target.value },
            }))
          }
          className="border p-2 rounded"
        />

        <label className="text-sm">終了</label>
        <input
          type="time"
          value={currentTime.endTime}
          onChange={(e) =>
            setTimesMap((prev) => ({
              ...prev,
              [selectedDay]: { ...currentTime, endTime: e.target.value },
            }))
          }
          className="border p-2 rounded"
        />
      </div>

      {/* ブックマークリスト（クリックで追加） */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">
          ブックマーク一覧（クリックで「{selectedDay}日目」に追加）
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {bookmarks.map((b) => (
            <button
              key={b.id}
              onClick={() => addToDay(b)}
              className="text-left border rounded p-2 hover:bg-gray-50"
              title={`${b.lat}, ${b.lng}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* 選択日の並び（並び替え＆削除） */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">{selectedDay}日目の順番</h3>
        {currentDayPlan.spots.length === 0 ? (
          <p className="text-sm text-gray-500">まだ追加されていません。</p>
        ) : (
          <ul className="space-y-2">
            {currentDayPlan.spots.map((s, idx) => (
              <li key={s.bookmarkId} className="flex items-center justify-between border rounded p-2">
                <div className="text-sm">
                  <span className="font-medium mr-2">{idx + 1}.</span>
                  {s.name}
                </div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 rounded border" onClick={() => moveUp(idx)} disabled={idx === 0}>↑</button>
                  <button className="px-2 py-1 rounded border" onClick={() => moveDown(idx)} disabled={idx === currentDayPlan.spots.length - 1}>↓</button>
                  <button className="px-2 py-1 rounded bg-red-500 text-white" onClick={() => removeFromDay(s.bookmarkId)}>削除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* この日のプラン生成（単日） */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">この日のプランを生成</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={generateThisDay}
            disabled={genLoading}
            className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {genLoading ? "生成中..." : `「${selectedDay}日目」を生成（${currentTime.startTime}〜${currentTime.endTime}）`}
          </button>
        </div>

        {genError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {genError}
          </div>
        )}
      </div>

      {/* 生成結果一覧（全日） */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">生成結果（すべての対象日）</h3>
        {dayList.map((d) => (
          <div key={d} className="border rounded p-2 bg-gray-50">
            <div className="text-sm font-semibold mb-1">
              {d}日目 <span className="text-gray-500">（{(timesMap[d]?.startTime ?? "09:00")}〜{(timesMap[d]?.endTime ?? "17:00")}）</span>
            </div>
            {generatedMap[d] ? (
              <pre className="whitespace-pre-wrap text-sm">{generatedMap[d]}</pre>
            ) : (
              <p className="text-sm text-gray-500">まだ生成していません。</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
