"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { NotificationCenter } from "./NotificationCenter";

export function NotificationBell() {
  const { unseen } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="התראות"
        className="fixed top-3 left-3 z-30 flex items-center justify-center w-10 h-10 rounded-xl shadow-md bg-white border border-gray-200 no-print"
      >
        <Bell className="w-5 h-5 text-navy-900" />
        {unseen > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>
      <NotificationCenter open={open} onClose={() => setOpen(false)} />
    </>
  );
}
