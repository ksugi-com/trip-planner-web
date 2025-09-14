"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/client";
import { doc, getDoc } from "firebase/firestore";
import MarkdownView from "../../../components/MarkdownView";

type DaySpot = { bookmarkId: string; name: string; lat: number; lng: number; order?: number };
type DayPlan = { day: number; spots: DaySpot[]; planText?: string };
type PlanDoc = { title: string; days: number; schedule: DayPlan[]; createdAt?: any };

export default function PlanDetailPage() {
  const params = useParams<{ planId: string }>();
  const planId = params.planId;
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ログイン状態を監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // プラン取得
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const ref = doc(db, "users", user.uid, "plans", planId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("プランが見つかりませんでした。");
          setPlan(null);
        } else {
          setPlan(snap.data() as PlanDoc);
          setError(null);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    if (planId && user) run();
  }, [planId, user]);

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <p className="text-gray-600">このページを表示するにはログインが必要です。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">プラン詳細</h1>
        <button
          className="text-sm text-blue-600 underline"
          onClick={() => router.back()}
        >
          戻る
        </button>
      </div>

      {loading && <p>読み込み中...</p>}
      {error && <p className="text-red-600">エラー: {error}</p>}

      {plan && (
        <div className="space-y-6">
          <div className="border rounded p-3">
            <div className="text-lg font-bold">{plan.title}</div>
            <div className="text-sm text-gray-600">日数: {plan.days}日</div>
          </div>

          {/* 日ごとに Markdown を表示 */}
          <div className="space-y-4">
            {Array.from({ length: plan.days }, (_, i) => i + 1).map((day) => {
              const dp = plan.schedule?.find((s) => s.day === day);
              return (
                <section key={day} className="border rounded p-3">
                  <h2 className="font-semibold mb-2">{day}日目</h2>

                  {dp?.planText ? (
                    <MarkdownView text={dp.planText} />
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 mb-2">
                        （この日の Markdown 生成結果は未保存です）
                      </p>
                      {dp?.spots?.length ? (
                        <ul className="text-sm list-disc pl-5">
                          {dp.spots
                            .slice()
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((s, idx) => (
                              <li key={s.bookmarkId}>
                                {idx + 1}. {s.name}{" "}
                                <span className="text-gray-400">
                                  ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                                </span>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">スポット未設定</p>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
