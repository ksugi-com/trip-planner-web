"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/client";
import type { Bookmark } from "./BookmarkList";

type DaySpot = { bookmarkId: string; name: string; lat: number; lng: number; order: number };
type DayPlan = { day: number; spots: DaySpot[] };

export default function DayPlanner({
  user,
  bookmarks,
}: {
  user: User;
  bookmarks: Bookmark[];
}) {
  const [title, setTitle] = useState("マイプラン");
  const [days, setDays] = useState(2);
  const [selectedDay, setSelectedDay] = useState(1);
  const [scheduleMap, setScheduleMap] = useState<Record<number, DayPlan>>({});

  // ★ 追加：日ごとの生成結果を保持する（キー=day, 値=生成テキスト）
  const [generatedMap, setGeneratedMap] = useState<Record<number, string>>({});
  const [transport, setTransport] = useState<"walk" | "public">("public");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // daysの変更に応じて枠を整える
  useEffect(() => {
    setScheduleMap((prev) => {
      const next: Record<number, DayPlan> = { ...prev };
      for (let d = 1; d <= days; d++) {
        if (!next[d]) next[d] = { day: d, spots: [] };
      }
      // 余剰日を削除
      Object.keys(next).forEach((k) => {
        const d = Number(k);
        if (d > days) delete next[d];
      });
      if (selectedDay > days) setSelectedDay(1);
      return next;
    });

    // 生成結果の余剰日も削除
    setGeneratedMap((prev) => {
      const next: Record<number, string> = {};
      for (let d = 1; d <= days; d++) {
        if (prev[d]) next[d] = prev[d];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => i + 1), [days]);
  const currentDayPlan = scheduleMap[selectedDay] ?? { day: selectedDay, spots: [] };

  const addToDay = (b: Bookmark) => {
    setScheduleMap((prev) => {
      const target = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      const exists = target.spots.some((s) => s.bookmarkId === b.id);
      if (exists) return prev; // 同一日への重複追加を防止（必要なら許容でもOK）
      const order = target.spots.length + 1;
      const added: DaySpot = {
        bookmarkId: b.id,
        name: b.name,
        lat: b.lat,
        lng: b.lng,
        order,
      };
      return { ...prev, [selectedDay]: { ...target, spots: [...target.spots, added] } };
    });
  };

  const removeFromDay = (bookmarkId: string) => {
    setScheduleMap((prev) => {
      const target = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      const filtered = target.spots
        .filter((s) => s.bookmarkId !== bookmarkId)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...target, spots: filtered } };
    });
  };

  const moveUp = (idx: number) => {
    setScheduleMap((prev) => {
      const target = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      if (idx <= 0) return prev;
      const arr = [...target.spots];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      const normalized = arr.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...target, spots: normalized } };
    });
  };

  const moveDown = (idx: number) => {
    setScheduleMap((prev) => {
      const target = prev[selectedDay] ?? { day: selectedDay, spots: [] };
      if (idx >= target.spots.length - 1) return prev;
      const arr = [...target.spots];
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      const normalized = arr.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...prev, [selectedDay]: { ...target, spots: normalized } };
    });
  };

  const savePlan = async () => {
    if (!user) return alert("ログインしてください");
    // Firestoreへ保存する際に、各日の生成結果も一緒に保存（planText）
    const schedule = dayList.map((d) => ({
      day: d,
      spots: (scheduleMap[d]?.spots ?? []),
      planText: generatedMap[d] ?? "", // ★ 生成済みがあれば保存
    }));
    const ref = await addDoc(collection(db, "users", user.uid, "plans"), {
      title,
      days,
      schedule,
      createdAt: serverTimestamp(),
    });
    alert(`プランを保存しました（id: ${ref.id}）`);
  };

  // この日のプランを LLM で生成 → その日のエリアにだけ反映、generatedMap に蓄積
  const generateThisDay = async () => {
    setGenError(null);
    const spots = (scheduleMap[selectedDay]?.spots ?? []).map((s) => ({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    }));

    if (spots.length === 0) {
      setGenError("この日に割り当てられたスポットがありません。ブックマーク一覧から追加してください。");
      return;
    }

    setGenLoading(true);
    try {
      const res = await fetch("/api/generate-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transport, spots }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setGenError(`生成エラー (${res.status}): ${text || "原因不明"}`);
        return;
      }
      const data = await res.json();
      const text = data.plan ?? "生成に失敗しました。";
      // ★ ここがポイント：選択中の日だけを書き換え、他の日の結果は保持
      setGeneratedMap((prev) => ({ ...prev, [selectedDay]: text }));
    } catch (e: any) {
      setGenError(`通信エラー: ${e?.message ?? String(e)}`);
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="w-full border rounded-lg p-3 space-y-4">
      <h2 className="font-semibold">日別プラン編集</h2>

      {/* 上部操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">プラン名</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border p-2 rounded w-60"
        />

        <label className="text-sm">日数</label>
        <input
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(e) => setDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
          className="border p-2 rounded w-24"
        />

        <label className="text-sm">閲覧日</label>
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
          className="border p-2 rounded"
        >
          {dayList.map((d) => (
            <option key={d} value={d}>{`日 ${d}`}</option>
          ))}
        </select>

        <button onClick={savePlan} className="px-3 py-2 rounded bg-emerald-600 text-white">
          プランを保存
        </button>
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

      {/* 選択日の並び（並び替え＆削除可） */}
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
                  <button
                    className="px-2 py-1 rounded border"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    title="上へ"
                  >
                    ↑
                  </button>
                  <button
                    className="px-2 py-1 rounded border"
                    onClick={() => moveDown(idx)}
                    disabled={idx === currentDayPlan.spots.length - 1}
                    title="下へ"
                  >
                    ↓
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-red-500 text-white"
                    onClick={() => removeFromDay(s.bookmarkId)}
                    title="削除"
                  >
                    削除
                  </button>
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
          <label className="text-sm">移動手段</label>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as "walk" | "public")}
            className="border p-2 rounded"
          >
            <option value="public">公共交通/車前提</option>
            <option value="walk">徒歩中心</option>
          </select>

          <button
            onClick={generateThisDay}
            disabled={genLoading}
            className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {genLoading ? "生成中..." : `「${selectedDay}日目」のプランを生成`}
          </button>
        </div>

        {genError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {genError}
          </div>
        )}
      </div>

      {/* ★ 追加：生成結果一覧（全日分を保持・表示） */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">生成結果（すべての対象日）</h3>
        {dayList.map((d) => (
          <div key={d} className="border rounded p-2 bg-gray-50">
            <div className="text-sm font-semibold mb-1">{d}日目</div>
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
