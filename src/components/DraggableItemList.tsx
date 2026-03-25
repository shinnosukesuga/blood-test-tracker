"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ItemMaster, BloodRecord } from "@/lib/types";
import { getAbnormalType } from "@/lib/itemMaster";

interface Props {
  items: ItemMaster[];
  record: BloodRecord | null;
  onReorder: (items: ItemMaster[]) => void;
}

// CSVの略称: 日本語でなく項目名と異なるaliasのうち最短のものを表示
function getCsvAbbr(item: ItemMaster): string | null {
  const isAsciiAbbr = (s: string) => !/[\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F]/.test(s) && s !== item.name;
  const candidates = item.aliases.filter(isAsciiAbbr);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.length <= b.length ? a : b));
}

function rangeText(item: ItemMaster): string {
  const { min, max } = item.range;
  if (min !== null && max !== null) return `基準: ${min}〜${max}`;
  if (min !== null) return `基準: ${min}〜`;
  if (max !== null) return `基準: 〜${max}`;
  return "";
}

function ItemRow({ item, value }: { item: ItemMaster; value: number | undefined }) {
  const abnType = value !== undefined ? getAbnormalType(item, value) : "normal";
  const isHigh = abnType === "high";
  const isLow  = abnType === "low";
  const abnormal = isHigh || isLow;
  const hasValue = value !== undefined;

  const bgCls    = isHigh ? "bg-red-50"    : isLow ? "bg-blue-50"    : "bg-white";
  const textCls  = isHigh ? "text-red-700" : isLow ? "text-blue-700" : "text-gray-800";
  const valCls   = isHigh ? "text-red-600" : isLow ? "text-blue-600" : "text-gray-800";
  const badgeCls = isHigh ? "text-red-500 bg-red-100" : "text-blue-500 bg-blue-100";

  const abbr = getCsvAbbr(item);

  return (
    <div className={`flex items-center px-4 py-2.5 border-b border-gray-100 ${bgCls}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-sm font-medium ${textCls}`}>{item.name}</span>
          {abbr && <span className="text-xs text-gray-400">{abbr}</span>}
        </div>
        {rangeText(item) && <div className="text-[11px] text-gray-400 mt-0.5">{rangeText(item)}</div>}
      </div>

      {/* バッジ | 数値＋単位（縦並び・固定幅） */}
      <div className="ml-2 shrink-0 flex items-center gap-1.5">
        <span className={`text-[10px] font-bold px-1 py-0.5 rounded shrink-0 ${abnormal ? badgeCls : "invisible"}`}>
          {isLow ? "低" : "高"}
        </span>
        <div className="w-16 text-right shrink-0">
          <div className={`text-base font-bold tabular-nums leading-tight ${valCls}`}>
            {hasValue ? value : <span className="text-gray-300 text-sm">—</span>}
          </div>
          <div className="text-[10px] text-gray-400 leading-tight">{item.unit}</div>
        </div>
      </div>

      <Link
        href={`/chart/${item.id}`}
        className="ml-2 text-gray-300 hover:text-red-500 transition shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}

export default function DraggableItemList({ items, record }: Props) {
  return (
    <div className="bg-white">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} value={record?.values[item.id]} />
      ))}
    </div>
  );
}
