"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { ItemMaster, BloodRecord, HealthEvent } from "@/lib/types";
import DatePicker from "@/components/DatePicker";
import { loadItems, loadRecords, loadEvents, loadSettings, saveEvent, generateId } from "@/lib/storage";
import { isAbnormal, getAbnormalType } from "@/lib/itemMaster";

// 年ごとの色
const YEAR_COLORS = [
  "#dc2626", "#2563eb", "#16a34a", "#d97706",
  "#7c3aed", "#0891b2", "#be185d",
];

// チャート用データ変換: X軸を月(1-12)、年ごとのラインに
interface ChartPoint {
  month: number;
  [year: string]: number | undefined | null;
}

function buildChartData(
  records: BloodRecord[],
  itemId: string
): { data: ChartPoint[]; years: string[] } {
  const byYearMonth: Map<string, Map<number, number>> = new Map();

  for (const r of records) {
    const val = r.values[itemId];
    if (val === undefined) continue;
    const [year, month] = r.date.split("-");
    if (!byYearMonth.has(year)) byYearMonth.set(year, new Map());
    byYearMonth.get(year)!.set(parseInt(month), val);
  }

  const years = Array.from(byYearMonth.keys()).sort((a, b) => b.localeCompare(a));
  const data: ChartPoint[] = Array.from({ length: 12 }, (_, i) => {
    const point: ChartPoint = { month: i + 1 };
    for (const year of years) {
      point[year] = byYearMonth.get(year)?.get(i + 1) ?? null;
    }
    return point;
  });

  return { data, years };
}

// カスタムドット（高=赤、低=青で強調）
function CustomDot({
  cx, cy, value, color,
}: {
  cx?: number; cy?: number; value?: number; item: ItemMaster; color: string;
}) {
  if (!cx || !cy || value === undefined || value === null) return null;
  return (
    <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={2} />
  );
}

export default function ChartPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();

  const [item, setItem] = useState<ItemMaster | null>(null);
  const [allItems, setAllItems] = useState<ItemMaster[]>([]);
  const [records, setRecords] = useState<BloodRecord[]>([]);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEventLabel, setNewEventLabel] = useState("");
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const STORAGE_KEY = "chart_hidden_years";
  const currentYear = String(new Date().getFullYear());

  const [hiddenYears, setHiddenYears] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const saveHiddenYears = (next: Set<string>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    setHiddenYears(next);
  };

  const toggleYear = (year: string) => {
    const next = new Set(hiddenYears);
    next.has(year) ? next.delete(year) : next.add(year);
    saveHiddenYears(next);
  };

  const handleCurrentYear = () => {
    saveHiddenYears(new Set(years.filter(y => y !== currentYear)));
  };

  const handle3Years = () => {
    // データの最新年から3年分を表示
    const latest = years[0]; // 降順なので先頭が最新
    const latestNum = parseInt(latest);
    saveHiddenYears(new Set(years.filter(y => parseInt(y) < latestNum - 2)));
  };

  const handleAllYears = () => {
    saveHiddenYears(new Set());
  };

  const [showChangeHelp, setShowChangeHelp] = useState(false);
  const changeHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    const items = loadItems().filter((i) => i.visible).sort((a, b) => a.order - b.order);
    const found = items.find((i) => i.id === itemId);
    setItem(found ?? null);
    setAllItems(items);
    setRecords(loadRecords());
    setEvents(loadEvents());
    setSettings(loadSettings());
  }, [itemId]);

  const currentIdx = allItems.findIndex((i) => i.id === itemId);
  const prevItem = currentIdx > 0 ? allItems[currentIdx - 1] : null;
  const nextItem = currentIdx < allItems.length - 1 ? allItems[currentIdx + 1] : null;

  const { data, years } = item ? buildChartData(records, itemId) : { data: [], years: [] };

  const isOnlyCurrentYear = years.length > 0 && hiddenYears.size === years.length - 1 && !hiddenYears.has(currentYear);
  const is3Years = (() => {
    if (years.length === 0) return false;
    const latest = years[0];
    const latestNum = parseInt(latest);
    const hide = years.filter(y => parseInt(y) < latestNum - 2);
    return hide.length > 0 && hiddenYears.size === hide.length && hide.every(y => hiddenYears.has(y));
  })();
  const isAllYears = hiddenYears.size === 0;

  // チャートのY軸範囲（データ + 閾値を含めて自動調整）
  const allValues = records
    .map(r => r.values[itemId])
    .filter((v): v is number => v !== undefined);
  const refValues = [item?.range.min, item?.range.max].filter((v): v is number => v !== null && v !== undefined);
  const allForDomain = [...allValues, ...refValues];
  const rawMin = allForDomain.length ? Math.min(...allForDomain) : 0;
  const rawMax = allForDomain.length ? Math.max(...allForDomain) : 100;
  const padding = (rawMax - rawMin) * 0.1 || 5;
  const domainMin = Math.floor(rawMin - padding);
  const domainMax = Math.ceil(rawMax + padding);

  // 最新値と前回比
  const CHANGE_THRESHOLD = settings.changeThreshold ?? 10;
  const latestRecord = records[0];
  const prevRecord = records[1];
  const latestValue = latestRecord?.values[itemId];
  const prevValue = prevRecord?.values[itemId];
  const change =
    latestValue !== undefined && prevValue !== undefined
      ? ((latestValue - prevValue) / prevValue) * 100
      : null;

  const handleAddEvent = () => {
    if (!newEventLabel.trim()) return;
    const event: HealthEvent = {
      id: generateId(),
      date: newEventDate,
      label: newEventLabel.trim(),
    };
    saveEvent(event);
    setEvents(loadEvents());
    setNewEventLabel("");
    setShowAddEvent(false);
  };

  if (!item) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-gray-400">
        <p>項目が見つかりません</p>
        <button onClick={() => router.back()} className="mt-4 text-red-600">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-red-600 text-white px-4 pt-4 pb-3 sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1 shrink-0">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-base font-bold truncate">{item.name}</h1>
            <p className="text-red-200 text-xs truncate">
              {item.aliases.slice(1).join(" / ")}{item.unit ? ` · ${item.unit}` : ""}
            </p>
          </div>
          {/* 項目間ナビ */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => prevItem && router.replace(`/chart/${prevItem.id}`)}
              disabled={!prevItem}
              className="p-1.5 rounded-full bg-red-500 disabled:opacity-30"
              title={prevItem?.name}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => nextItem && router.replace(`/chart/${nextItem.id}`)}
              disabled={!nextItem}
              className="p-1.5 rounded-full bg-red-500 disabled:opacity-30"
              title={nextItem?.name}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="pb-8">
        {/* サマリーカード */}
        <div className="bg-white mx-4 mt-4 rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-400">最新値 ({latestRecord?.date})</p>
              {latestValue !== undefined ? (
                <p
                  className={`text-3xl font-bold mt-1 ${
                    getAbnormalType(item, latestValue) === "high" ? "text-red-600" :
                    getAbnormalType(item, latestValue) === "low"  ? "text-blue-600" :
                    "text-gray-800"
                  }`}
                >
                  {latestValue}
                  <span className="text-sm font-normal text-gray-400 ml-1">{item.unit}</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-300 mt-1">—</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">基準値</p>
              <p className="text-sm font-medium text-gray-600 mt-1">
                {item.range.min !== null || item.range.max !== null
                  ? `${item.range.min ?? ""}〜${item.range.max ?? ""}`
                  : "—"}
              </p>
              {change !== null && prevValue !== undefined && latestValue !== undefined && (
                <div className="mt-1 relative">
                  <p
                    className={`text-sm font-semibold inline-flex items-center gap-1 ${
                      !settings.changeHighlight || Math.abs(change) <= CHANGE_THRESHOLD
                        ? "text-gray-800"
                        : change > 0
                        ? "text-red-500"
                        : "text-blue-500"
                    }`}
                  >
                    前回比: {latestValue > prevValue ? "+" : "-"}{Math.abs(latestValue - prevValue).toFixed(1)} {item.unit}（{latestValue > prevValue ? "+" : "-"}{Math.abs(change).toFixed(1)}%）
                    <button
                      onClick={() => {
                        if (changeHelpTimerRef.current) clearTimeout(changeHelpTimerRef.current);
                        setShowChangeHelp(v => {
                          if (!v) {
                            changeHelpTimerRef.current = setTimeout(() => setShowChangeHelp(false), 4000);
                          }
                          return !v;
                        });
                      }}
                      className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0 leading-none"
                    >?</button>
                  </p>
                  {showChangeHelp && (
                    <div className="absolute right-0 top-6 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 w-56 shadow-lg text-left">
                      <p className="font-bold mb-1">前回比の色強調ルール</p>
                      <p>前回値からの変化率が <span className="font-bold text-yellow-300">{CHANGE_THRESHOLD}%</span> を超えた場合に色がつきます。</p>
                      <p className="mt-1"><span className="text-red-400">赤</span>：増加　<span className="text-blue-400">青</span>：減少</p>
                      <p className="mt-1 text-gray-400">閾値は設定から変更できます。</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* チャート */}
        <div className="bg-white mt-3 mx-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-gray-700">年度別トレンド</h2>
            <button
              onClick={() => setShowAddEvent((v) => !v)}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
            >
              <Plus size={14} />
              イベント追加
            </button>
          </div>

          {years.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">データがありません</p>
          ) : (
            <>
              {/* 凡例（タップで表示切替） */}
              <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide">
                {years.map((year, idx) => {
                  const hidden = hiddenYears.has(year);
                  const color = YEAR_COLORS[idx % YEAR_COLORS.length];
                  return (
                    <button
                      key={year}
                      onClick={() => toggleYear(year)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition whitespace-nowrap shrink-0 ${
                        hidden
                          ? "border-gray-200 text-gray-300 bg-gray-50"
                          : "border-gray-200 text-gray-600 bg-white"
                      }`}
                    >
                      <div
                        className="w-5 h-[3px] rounded-full transition"
                        style={{ backgroundColor: hidden ? "#d1d5db" : color }}
                      />
                      {year}年
                    </button>
                  );
                })}
              </div>

              {/* プリセットフィルター */}
              <div className="flex gap-2 px-4 pb-3">
                {[
                  { label: "今年", active: isOnlyCurrentYear, onClick: handleCurrentYear },
                  { label: "3年",  active: is3Years,          onClick: handle3Years },
                  { label: "すべて", active: isAllYears,       onClick: handleAllYears },
                ].map(({ label, active, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className={`flex-1 py-1 rounded-full text-xs font-bold border transition ${
                      active
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-500 border-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => `${v}月`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={48} domain={[domainMin, domainMax]} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const sorted = [...payload]
                        .filter(e => e.value !== null && e.value !== undefined)
                        .sort((a, b) => String(b.name).localeCompare(String(a.name)));
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-sm">
                          <p className="font-bold text-gray-600 mb-1.5">{label}月</p>
                          {sorted.map(e => (
                            <p key={e.name} style={{ color: e.color }} className="font-semibold leading-5">
                              {e.name}年：{e.value} {item.unit}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />

                  {/* 閾値範囲の網掛け（正常範囲を緑で塗る）
                      From未定義 → 0 から To まで
                      To未定義   → From から 表示最大値 まで */}
                  {(item.range.min !== null || item.range.max !== null) && (
                    <ReferenceArea
                      y1={item.range.min ?? 0}
                      y2={item.range.max ?? domainMax}
                      fill="#7dd3fc"
                      fillOpacity={0.15}
                      stroke="#38bdf8"
                      strokeWidth={1}
                      ifOverflow="hidden"
                    />
                  )}

                  {/* 基準値ライン */}
                  {item.range.min !== null && (
                    <ReferenceLine
                      y={item.range.min}
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={undefined}
                    />
                  )}
                  {item.range.max !== null && (
                    <ReferenceLine
                      y={item.range.max}
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={undefined}
                    />
                  )}

                  {/* イベントライン */}
                  {events.map((ev) => {
                    const month = parseInt(ev.date.split("-")[1]);
                    return (
                      <ReferenceLine
                        key={ev.id}
                        x={month}
                        stroke="#a78bfa"
                        strokeDasharray="3 3"
                        label={{ value: ev.label, fontSize: 9, fill: "#7c3aed", angle: -90 }}
                      />
                    );
                  })}

                  {/* 年ごとのライン */}
                  {years.map((year, idx) =>
                    hiddenYears.has(year) ? null : (
                    <Line
                      key={year}
                      type="monotone"
                      dataKey={year}
                      stroke={YEAR_COLORS[idx % YEAR_COLORS.length]}
                      strokeWidth={2}
                      connectNulls
                      dot={(props) => (
                        <CustomDot
                          key={props.key}
                          cx={props.cx}
                          cy={props.cy}
                          value={props.value}
                          item={item}
                          color={YEAR_COLORS[idx % YEAR_COLORS.length]}
                        />
                      )}
                    />
                  )
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div className="pb-4" />
            </>
          )}
        </div>

        {/* イベント追加フォーム */}
        {showAddEvent && (
          <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">イベントを追加</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowEventDatePicker(true)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-left text-gray-800"
              >
                {newEventDate || "日付を選択"}
              </button>
              {showEventDatePicker && (
                <DatePicker
                  value={newEventDate}
                  onChange={setNewEventDate}
                  onClose={() => setShowEventDatePicker(false)}
                />
              )}
              <input
                type="text"
                value={newEventLabel}
                onChange={(e) => setNewEventLabel(e.target.value)}
                placeholder="例: 花粉症開始、忘年会など"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
              />
              <button
                onClick={handleAddEvent}
                className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
              >
                追加
              </button>
            </div>
          </div>
        )}

        {/* 過去の値一覧 */}
        <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">過去の検査値</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {records
              .filter((r) => r.values[itemId] !== undefined)
              .map((r) => {
                const val = r.values[itemId];
                const t = getAbnormalType(item, val);
                const bgCls = t === "high" ? "bg-red-50" : t === "low" ? "bg-blue-50" : "";
                const valCls = t === "high" ? "text-red-600" : t === "low" ? "text-blue-600" : "text-gray-800";
                const badgeCls = t === "high" ? "text-red-500 bg-red-100" : "text-blue-500 bg-blue-100";
                return (
                  <div key={r.id} className={`flex items-center px-4 py-2.5 ${bgCls}`}>
                    <span className="text-sm text-gray-500 flex-1 tabular-nums">{r.date}</span>
                    {/* grid で バッジ・数値・単位を固定幅に */}
                    <div className="shrink-0 grid items-center" style={{gridTemplateColumns:"24px 72px 52px"}}>
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded text-center ${t !== "normal" ? badgeCls : "invisible"}`}>
                        {t === "low" ? "低" : "高"}
                      </span>
                      <span className={`text-base font-bold tabular-nums text-right pr-1 ${valCls}`}>{val}</span>
                      <span className="text-xs text-gray-400 truncate">{item.unit}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </main>
    </div>
  );
}
