// app/page.tsx (Next.js App Router)
"use client";

import { useState, useEffect } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { initializeApp } from "firebase/app";

// ===== Firebase 初期化 =====
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ===== Google Maps 設定 =====
const containerStyle = {
  width: "100%",
  height: "400px",
};
const center = {
  lat: 35.681236, // 東京駅
  lng: 139.767125,
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <main className="flex flex-col items-center p-6 space-y-4">
      <h1 className="text-2xl font-bold">Trip Planner (Starter)</h1>

      {!user ? (
        <button
          onClick={handleLogin}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow"
        >
          Googleでログイン
        </button>
      ) : (
        <div className="space-y-2">
          <p>ログイン中: {user.displayName}</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg shadow"
          >
            ログアウト
          </button>
        </div>
      )}

      {isLoaded && (
        <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={12}>
          <Marker position={center} />
        </GoogleMap>
      )}
    </main>
  );
}
