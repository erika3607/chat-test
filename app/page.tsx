"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // --- 1. 初回データ読み込み ---
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // --- 2. リアルタイム監視 (メッセージ本体 + 入力中) ---
    const channel = supabase.channel("room-1", {
      config: { broadcast: { self: false } },
    });

    channel
      // A. 新しいメッセージがDBに入った時
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((current) => [...current, payload.new]);
        },
      )
      // B. 誰かが入力中の信号（Broadcast）を送ってきた時
      .on("broadcast", { event: "typing" }, () => {
        setIsTyping(true);
        // 3秒後に消す（タイマーが重複しないよう簡易的に管理）
        const timer = setTimeout(() => setIsTyping(false), 3000);
        return () => clearTimeout(timer);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 入力信号を送信する
  const handleTyping = () => {
    const channel = supabase.channel("room-1");
    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user: "anonymous" },
    });
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const { error } = await supabase.from("messages").insert([{ content: input }]);
    if (error) console.error("送信エラー:", error);
    else setInput("");
  };

  return (
    <main className="max-w-md mx-auto p-4 h-screen flex flex-col text-black">
      <h1 className="text-xl font-bold mb-4">Message</h1>

      {/* メッセージ表示エリア */}
      <div className="flex-1 overflow-y-auto space-y-2 border p-4 mb-2 rounded bg-white">
        {messages.map((m, i) => (
          <div key={i} className="p-3 bg-gray-100 rounded shadow-sm">
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {/* 入力中表示をリストの最下部に配置 */}
        <div className="h-6">
          {isTyping && (
            <p className="text-xs text-gray-400 italic animate-pulse">誰かが入力中...</p>
          )}
        </div>
      </div>

      {/* 入力フォームエリア */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            className="flex-1 border p-3 rounded focus:ring-2 focus:ring-amber-400 outline-none"
            placeholder="メッセージを入力..."
            rows={2}
          />
          <button
            onClick={sendMessage}
            className="bg-amber-400 text-white px-4 py-2 rounded font-bold hover:bg-amber-500 transition-colors"
          >
            送信
          </button>
        </div>
      </div>
    </main>
  );
}
