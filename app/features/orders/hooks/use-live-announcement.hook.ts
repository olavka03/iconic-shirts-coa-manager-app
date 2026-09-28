import { useState } from "react";

export function useLiveAnnouncement(message: string | null): string {
  const [lastMessage, setLastMessage] = useState(message ?? "");

  if (message !== null && message !== lastMessage) {
    setLastMessage(message);
  }

  return message ?? lastMessage;
}
