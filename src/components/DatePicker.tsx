"use client";

import { useState } from "react";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

interface Props {
  value: string;       // "YYYY-MM-DD"
  onChange: (date: string) => void;
  onClose: () => void;
}

export default function DatePicker({ value, onChange, onClose }: Props) {
  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : today;
  const [viewYear,  setViewYear]  = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());

  const selYear  = value ? parseInt(value.slice(0, 4)) : null;
  const selMonth = value ? parseInt(value.slice(5, 7)) - 1 : null;
  const selDay   = value ? parseInt(value.slice(8, 10)) : null;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl p-4 w-[308px] shadow-2xl">

        {/* 月ナビゲーション */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="text-2xl px-3 py-1 text-gray-600">‹</button>
          <span className="font-bold text-base">{viewYear}年 {viewMonth + 1}月</span>
          <button onClick={nextMonth} className="text-2xl px-3 py-1 text-gray-600">›</button>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[11px] py-1 font-medium ${
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-400"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day     = i + 1;
            const isSelected = selYear === viewYear && selMonth === viewMonth && selDay === day;
            const isToday    = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
            const weekday    = (firstDay + i) % 7;
            return (
              <button
                key={day}
                onClick={() => handleDay(day)}
                className={`w-9 h-9 mx-auto flex items-center justify-center rounded-full text-sm transition
                  ${isSelected
                    ? "bg-red-600 text-white font-bold"
                    : isToday
                    ? "bg-red-50 font-bold text-red-600"
                    : weekday === 0
                    ? "text-red-500 hover:bg-gray-100"
                    : weekday === 6
                    ? "text-blue-500 hover:bg-gray-100"
                    : "text-gray-800 hover:bg-gray-100"
                  }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* キャンセル */}
        <button
          onClick={onClose}
          className="mt-3 w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
