"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AskForm, type QaApp } from "@/components/QandA";

// Pick which of your apps it's about, then ask (with a poll if you like).
export function AskAnywhere({ apps }: { apps: QaApp[] }) {
  const router = useRouter();
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const app = apps.find((a) => a.id === appId) ?? apps[0];

  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">About</span>
        <select value={appId} onChange={(e) => setAppId(e.target.value)} className="field" aria-label="Which app">
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <AskForm key={app.id} app={app} onAsked={(id) => router.push(`/q/${id}`)} />
    </div>
  );
}
