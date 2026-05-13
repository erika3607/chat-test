"use client";

// push
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
  const [myId, setMyId] = useState("");

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

  useEffect(() => {
    let id = localStorage.getItem("my_chat_id");
    if (!id) {
      id = Math.random().toString(36).substring(7);
      localStorage.setItem("my_chat_id", id);
    }
    setMyId(id);
    console.log("私のID：", id);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const { error } = await supabase.from("messages").insert([{ content: input, user_id: myId }]);
    if (error) console.error("送信エラー:", error);
    else setInput("");
  };

  return (
    <main className="max-w-md mx-auto flex flex-col text-[#333] justify-center">
      {/* メッセージ表示エリア */}
      <div className="flex-none overflow-y-auto space-y-3 border max-h-[80vh] p-5 mb-6 rounded-lg bg-linear-to-br from-[#FFE0AF] to-[#FFC8A1]">
        {messages.map((m, i) => {
          const isMine = m.user_id === myId; // 自分のメッセージか判定

          return (
            <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
                  isMine
                    ? "bg-amber-400 text-white rounded-br-none" // 自分の：右下を角張らせる
                    : "bg-white text-black rounded-bl-none" // 他人の：左下を角張らせる
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              </div>
            </div>
          );
        })}

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
            className="flex-1 border rounded-full py-4 px-6 bg-white focus:ring-2 focus:ring-amber-400 outline-none"
            placeholder="メッセージを入力..."
            rows={1}
          />
          <button
            onClick={sendMessage}
            className="px-4 py-2 rounded-full font-bold bg-amber-400 text-white"
          >
            submit
          </button>
        </div>
      </div>
    </main>
  );
}
