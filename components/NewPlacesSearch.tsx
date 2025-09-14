"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
};

export default function NewPlacesSearch({
  onPick,
  placeholder = "場所を検索（例：浅草寺）",
  languageCode = "ja",
  regionCode = "JP",
  minChars = 2,
}: {
  onPick: (p: { name: string; lat: number; lng: number }) => void;
  placeholder?: string;
  languageCode?: string;
  regionCode?: string;
  minChars?: number;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // 入力に応じて Places API (New) の autocomplete を叩く
  useEffect(() => {
    if (!apiKey) return;
    if (q.trim().length < minChars) {
      setSugs([]);
      return;
    }
    setLoading(true);
    setOpen(true);

    // 直前のリクエストはキャンセル
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const timer = setTimeout(async () => {
      try {
        const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
          },
          body: JSON.stringify({
            input: q.trim(),
            languageCode,
            regionCode,
          }),
          signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const list: Suggestion[] =
          data?.suggestions
            ?.map((s: any) => ({
              placeId: s?.placePrediction?.placeId,
              primaryText: s?.placePrediction?.text?.text ?? "",
              secondaryText: s?.placePrediction?.text?.matches
                ? undefined
                : undefined,
            }))
            .filter((s: Suggestion) => !!s.placeId && !!s.primaryText) ?? [];
        setSugs(list);
      } catch (e) {
        if ((e as any).name !== "AbortError") {
          console.error("places:autocomplete error", e);
          setSugs([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250); // 簡易デバウンス

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, apiKey, languageCode, regionCode, minChars]);

  const pickPlace = async (s: Suggestion) => {
    try {
      // New Places の 詳細取得（Place Details）
      const resp = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(s.placeId)}?languageCode=${languageCode}&regionCode=${regionCode}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "displayName,location",
          },
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const name: string = data?.displayName?.text ?? s.primaryText;
      const lat = data?.location?.latitude;
      const lng = data?.location?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("場所の座標が取得できませんでした。");
      }
      onPick({ name, lat, lng });
      setQ(name);
      setOpen(false);
    } catch (e) {
      console.error("places details error", e);
      alert("場所の詳細取得に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <div className="relative w-full">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="border rounded p-2 w-full"
      />
      {open && (loading || sugs.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded border bg-white shadow">
          {loading && (
            <div className="p-2 text-sm text-gray-500">検索中...</div>
          )}
          {!loading &&
            sugs.map((s) => (
              <button
                key={s.placeId}
                onClick={() => pickPlace(s)}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
              >
                {s.primaryText}
              </button>
            ))}
          {!loading && sugs.length === 0 && q.trim().length >= minChars && (
            <div className="p-2 text-sm text-gray-500">候補が見つかりません</div>
          )}
        </div>
      )}
    </div>
  );
}
