"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import type { User } from "firebase/auth";

export type Bookmark = { id: string; name: string; lat: number; lng: number };

export default function BookmarkList({
  user,
  onFocus,
}: {
  user: User;
  onFocus?: (b: Bookmark) => void;
}) {
  const [items, setItems] = useState<Bookmark[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "users", user.uid, "bookmarks"),
      orderBy("name", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bookmark, "id">) }))
      );
    });
    return () => unsub();
  }, [user.uid]);

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "users", user.uid, "bookmarks", id));
  };

  return (
    <div className="w-full border rounded-lg p-3 space-y-2">
      <h2 className="font-semibold">保存したブックマーク</h2>
      {items.length === 0 && (
        <p className="text-sm text-gray-500">まだブックマークがありません。</p>
      )}
      <ul className="space-y-2">
        {items.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between gap-2 border rounded p-2"
          >
            <button
              onClick={() => onFocus?.(b)}
              className="text-left flex-1 hover:underline"
              title={`${b.lat}, ${b.lng}`}
            >
              {b.name}
            </button>
            <button
              onClick={() => handleDelete(b.id)}
              className="text-sm px-2 py-1 rounded bg-red-500 text-white"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
