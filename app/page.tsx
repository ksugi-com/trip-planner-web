"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase/client";
import BookmarkList, { Bookmark } from "@/components/BookmarkList";
import dynamic from "next/dynamic";
const PlanGenerator = dynamic(() => import("@/components/PlanGenerator"), { ssr: false });

const containerStyle = { width: "100%", height: "420px" };
const defaultCenter = { lat: 35.681236, lng: 139.767125 }; // 東京駅

export default function Home() {
  const { isLoaded } = useJsApiLoader({
    id: "google-map",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const [user, setUser] = useState<any>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "users", user.uid, "bookmarks"), (snap) => {
      setBookmarks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
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
    if (!name || !selected) return alert("地図をクリックして場所と名前を入力してください");
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
    await signInWithPopup(auth, provider);
  };
  const handleLogout = async () => signOut(auth);

  return (
    <main className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trip Planner</h1>
        {!user ? (
          <button onClick={handleLogin} className="px-3 py-2 rounded bg-blue-600 text-white">
            Googleでログイン
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">ログイン中: {user.displayName}</span>
            <button onClick={handleLogout} className="px-3 py-2 rounded bg-gray-600 text-white">
              ログアウト
            </button>
          </div>
        )}
      </header>

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
                  {selected ? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}` : "—"}
                </span>
              </div>
              <button
                onClick={handleSave}
                className="px-3 py-2 rounded bg-green-600 text-white"
              >
                保存
              </button>
            </div>
          )}
        </div>

        {/* 右：リスト & 生成 */}
        <div className="space-y-3">
          {user ? (
            <>
              <BookmarkList
                user={user}
                onFocus={(b) => setSelected({ lat: b.lat, lng: b.lng })}
              />
              <PlanGenerator bookmarks={bookmarks} />
            </>
          ) : (
            <p className="text-gray-600">ログインするとブックマークリストとプラン生成が使えます。</p>
          )}
        </div>
      </div>
    </main>
  );
}
