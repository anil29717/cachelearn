import React from 'react';

/**
 * Optional embedded chat — disabled unless VITE_EMBED_CHAT_URL is set (HTTPS recommended).
 */
export default function ChatbotEmbed() {
  const embedUrl = String(import.meta.env.VITE_EMBED_CHAT_URL || '').trim();
  if (!embedUrl) return null;

  let safeUrl;
  try {
    const u = new URL(embedUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    safeUrl = u.toString();
  } catch {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 w-[350px] h-[550px] z-50">
      <div className="w-full h-full rounded-2xl shadow-2xl overflow-hidden border bg-white">
        <iframe
          src={safeUrl}
          title="Support chat"
          allow="microphone"
          className="w-full h-full border-0"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
