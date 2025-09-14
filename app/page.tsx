"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect, // ← COOP対策としてリダイレクト推奨
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/client";
import BookmarkList, { Bookmark } from "../components/BookmarkList";
import PlanGenerator from "../components/PlanGenerator";
import DayPlanner from "../components/DayPlanner";
import NewPlacesSearch from "../components/NewPlacesSearch";

const containerStyle = { width: "100%", height: "420px" };
const defaultCenter = { lat: 35.681236, lng: 139.767125 };

export default function Home() {
  const { isLoaded } = useJsApiLoader({
    id: "google-map",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    // ★ Legacy回避のため "places" ライブラリは読み込まない（RESTで完結）
    version: "weekly",
  });

  const [user, setUser] = useState<any>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    // リダイレクト結果の回収（エラー時の可視化）
    getRedirectResult(auth).catch((e) => console.warn("redirect auth error:", e));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "bookmarks"),
      (snap) => {
        setBookmarks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
    );
    return () => unsub();
  }, [user]);

  const center = useMemo(() => {
    if (selected) return selected;
    if (bookmarks[0]) return { lat: bookmarks[0].lat, lng: bookmarks[0].lng };
    return defaultCenter;
  }, [selected, bookmarks]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) setSelected({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const handleSave = async () => {
    if (!user) return alert("ログインしてください");
    if (!name || !selected) {
      alert("地図をクリックまたは検索で場所を選び、名前を入力してください");
      return;
    }
    await addDoc(collection(db, "users", user.uid, "bookmarks"), {
      name,
      lat: selected.lat,
      lng: selected.lng,
    });
    setName("");
    setSelected(null);
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  };
  const handleLogout = async () => signOut(auth);

  const canSave = !!user && !!(selected && name);

  return (
    <main className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trip Planner</h1>
        {!user ? (
          <button
            onClick={handleLogin}
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            Googleでログイン
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">
              ログイン中: {user.displayName}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded bg-gray-600 text-white"
            >
              ログアウト
            </button>
          </div>
        )}
      </header>

      {/* ★ New Places (REST) 検索ボックス */}
      <div className="flex gap-2">
        <NewPlacesSearch
          onPick={({ name, lat, lng }) => {
            setName(name);
            setSelected({ lat, lng });
          }}
          // 例：日本に限定
          languageCode="ja"
          regionCode="JP"
        />
        <button
          className={`px-3 py-2 rounded text-white ${
            canSave ? "bg-green-600" : "bg-gray-400 cursor-not-allowed"
          }`}
          onClick={handleSave}
          disabled={!canSave}
          title={!canSave ? "場所を選んでから保存" : "保存"}
        >
          保存
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 左：地図 + 追加フォーム */}
        <div className="space-y-3">
          {isLoaded && (
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={center}
              zoom={12}
              onClick={handleMapClick}
            >
              {selected && <Marker position={selected} />}
              {bookmarks.map((b) => (
                <Marker key={b.id} position={{ lat: b.lat, lng: b.lng }} />
              ))}
            </GoogleMap>
          )}

          {user && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="場所の名前（例：コロッセオ）"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border rounded p-2 w-full"
              />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>選択中:</span>
                <span>
                  {selected
                    ? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`
                    : "—"}
                </span>
              </div>
              <button
                onClick={handleSave}
                className={`px-3 py-2 rounded text-white ${
                  canSave ? "bg-green-600" : "bg-gray-400 cursor-not-allowed"
                }`}
                disabled={!canSave}
              >
                保存
              </button>
            </div>
          )}
        </div>

        {/* 右：リスト & プラン生成 */}
        <div className="space-y-3">
          {user ? (
            <>
              <BookmarkList
                user={user}
                onFocus={(b) => setSelected({ lat: b.lat, lng: b.lng })}
              />
              <DayPlanner user={user} bookmarks={bookmarks} />
              <PlanGenerator bookmarks={bookmarks} />
            </>
          ) : (
            <p className="text-gray-600">
              ログインするとブックマークリストとプラン生成が使えます。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
