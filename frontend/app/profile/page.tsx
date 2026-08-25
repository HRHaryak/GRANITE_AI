"use client";
import React from "react";
import { getSelectedUserId, setSelectedUserId } from "../../lib/storage";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const id = getSelectedUserId();
  const router = useRouter();
  return (
    <div className="py-6">
      <div className="text-lg font-semibold mb-4">Profile</div>
      <div className="bg-white/5 p-4 rounded-lg">
        <div className="text-sm text-white/70">Selected User</div>
        <div className="font-medium">{id || "None"}</div>
        <div className="mt-4">
          <button
            className="px-3 py-2 rounded bg-red-600 text-white"
            onClick={() => { setSelectedUserId(null); router.push("/"); }}
          >
            Change User
          </button>
        </div>
      </div>
    </div>
  );
}
