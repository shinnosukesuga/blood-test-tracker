import { ItemMaster, ItemCategory } from "./types";

function item(
  id: string,
  name: string,
  aliases: string[],
  unit: string,
  min: number | null,
  max: number | null,
  category: ItemCategory,
  order: number
): ItemMaster {
  return { id, name, aliases, unit, range: { min, max }, category, order, visible: true };
}

// CSV取り込み時に除外する項目名・エイリアスのセット
export const EXCLUDED_ITEM_NAMES = new Set([
  "Body Weight", "体重", "BW",
  "BMI (Auto-calc)", "BMI", "BMI (Auto-calc)",
]);

// ============================================================
// デフォルトアイテムマスター（ユーザー指定の表示順）
// ============================================================
export const DEFAULT_ITEMS: ItemMaster[] = [
  // 0: 血圧
  item("SBP",     "高血圧",                    ["高血圧（収縮期）", "高血圧"],  "mmHg",  null,  129,   "cardiovascular", 0),
  item("DBP",     "低血圧",                    ["低血圧（拡張期）", "低血圧"],  "mmHg",  null,  84,    "cardiovascular", 1),

  // 2–: 肝機能
  item("AST",     "GOT",                     ["AST", "GOT"],           "U/L",         13,    30,    "liver",          2),
  item("ALT",     "GPT",                     ["ALT", "GPT"],           "U/L",         10,    42,    "liver",          5),
  item("LD",      "LDH(乳酸脱水素酵素)",      ["LD", "LDH"],            "U/L",         124,   222,   "liver",          6),
  item("ChE",     "コリンエステラーゼ",         ["ChE"],                  "U/L",         240,   486,   "liver",          7),
  item("TBil",    "総ビリルビン",              ["T-Bil", "TBil"],        "mg/dl",       0.4,   1.5,   "liver",          8),
  item("AIP",     "アルカリフォスファターゼ",   ["AIP", "ALP"],           "U/L",         38,    113,   "liver",          9),
  item("GGT",     "γ-GTP",                   ["γ-GT", "γ-GTP", "GGT"], "U/L",         13,    64,    "liver",         10),
  item("TP",      "総蛋白",                   ["TP"],                   "g/dL",        6.6,   8.1,   "liver",         11),
  item("Alb",     "アルブミン",               ["Alb"],                  "g/dL",        4.1,   5.1,   "liver",         12),
  item("AG",      "アルブミン/グロブリン比",   ["A/G", "AG"],            "",            1.32,  2.23,  "liver",         13),
  item("Amy",     "アミラーゼ",               ["Amy"],                  "U/L",         44,    132,   "liver",         14),
  item("CK",      "クレアチンキナーゼ",        ["CK"],                   "U/L",         59,    248,   "metabolic",     15),

  // 16–: 腎機能
  item("UN",      "尿素窒素",                 ["UN", "BUN"],            "mg/dL",       8,     20,    "kidney",        16),
  item("Cr",      "クレアチニン",              ["Cr"],                   "mg/dL",       0.65,  1.07,  "kidney",        17),
  item("eGFR",    "推定糸球体濾過量",          ["cre", "eGFR"],          "mL/分/1.73",  60,    null,  "kidney",        18),
  item("UA",      "尿酸",                     ["UA"],                   "mg/dL",       3.7,   7.0,   "kidney",        19),

  // 20–: 代謝・炎症
  item("GLU",     "血糖(空腹時)",             ["GLU"],                  "mg/dL",       73,    109,   "metabolic",     20),
  item("CRP",     "C反応性タンパク",           ["CRP"],                  "mg/dL",       null,  0.14,  "inflammation",  21),
  item("LRG",     "ロイシンリッチα2グリコプロテイン", ["LRG"],            "μg/mL",       null,  15.9,  "inflammation",  22),
  item("PGEMUM",  "PGE-MUM",                 ["PGE-MUM", "PGEMUM"],    "ng/mL",       null,  null,  "inflammation",  23),
  item("PGECr",   "PGE-MUM(Cr換算値)",       ["PGE-MUM(Cr換算値)", "PGE-MUM Cr"], "ng/mgCr", null, null, "inflammation", 24),

  // 25–: 血液（赤血球系）
  item("WBC",     "白血球数",                 ["WBC"],                  "10*3/μL",     3.3,   8.6,   "blood",         25),
  item("RBC",     "赤血球数",                 ["RBC"],                  "10*6/μL",     4.35,  5.55,  "blood",         26),
  item("Hb",      "ヘモグロビン濃度",          ["Hb"],                   "g/dL",        13.7,  16.8,  "blood",         27),
  item("Ht",      "ヘマトクリット値",          ["Ht"],                   "%",           40.7,  50.1,  "blood",         28),
  item("MCV",     "平均赤血球容積",            ["MCV"],                  "fL",          83.6,  98.2,  "blood",         29),
  item("MCH",     "平均赤血球血色素量",        ["MCH"],                  "pg",          27.5,  33.2,  "blood",         30),
  item("MCHC",    "平均赤血球血色素濃度",      ["MCHC"],                 "g/dL",        31.7,  35.3,  "blood",         31),
  item("RDW",     "赤血球分布幅",              ["CV", "RDW"],            "%",           11.1,  14.7,  "blood",         32),
  item("PLT",     "血小板数",                 ["PLT"],                  "10*3/μL",     158,   348,   "blood",         33),
  item("MPV",     "平均血小板容積",            ["MPV"],                  "fL",          8.4,   12.8,  "blood",         34),
  item("PDW",     "血小板分布幅",              ["PDW"],                  "fL",          8,     14.5,  "blood",         35),

  // 36–: 白血球分画（%）
  item("NeuP",    "好中球%",                  ["好中球%"],               "%",           40.6,  76.4,  "differential",  36),
  item("LymP",    "リンパ球%",               ["リンパ球%"],              "%",           16.5,  49.5,  "differential",  37),
  item("MonP",    "単球%",                   ["単球%"],                  "%",           2,     10,    "differential",  38),
  item("EosP",    "好酸球%",                 ["好酸球%"],                "%",           0,     8.5,   "differential",  39),
  item("BasP",    "好塩基球%",               ["好塩基球%"],              "%",           0,     2.5,   "differential",  40),

  // 41–: 白血球分画（数）
  item("NeuN",    "好中球数",                 ["好中球数"],              "10*3/μL",     1.7,   6.3,   "differential",  41),
  item("LymN",    "リンパ球数",              ["リンパ球数"],             "10*3/μL",     1,     3.1,   "differential",  42),
  item("MonN",    "単球数",                  ["単球数"],                 "10*3/μL",     0.1,   0.6,   "differential",  43),
  item("EosN",    "好酸球数",                ["好酸球数"],               "10*3/μL",     0,     0.5,   "differential",  44),
  item("BasN",    "好塩基球数",              ["好塩基球数"],             "10*3/μL",     0,     0.2,   "differential",  45),

  // 46–: その他血液
  item("NucRBC",  "有核赤血球%",             ["有核赤血球%"],            "/100WBC",     0,     0,     "blood",         46),
  item("ImGranP", "幼若顆粒球%",             ["幼若顆粒球%"],            "%",           null,  null,  "blood",         47),
  item("ImGranN", "幼若顆粒球数",            ["幼若顆粒球数"],           "10*3/μL",     null,  null,  "blood",         48),
  item("LPLT",    "大型血小板比率",           ["大型血小板比率"],          "%",           null,  null,  "blood",         49),
  item("ESR",     "血沈1時間値",             ["ESR"],                    "mm",          2,     10,    "inflammation",  50),
];

// ── カテゴリ表示名 ──────────────────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  liver:          "肝機能",
  kidney:         "腎機能",
  metabolic:      "代謝系",
  inflammation:   "炎症",
  cardiovascular: "血圧",
  blood:          "血液",
  differential:   "白血球分画",
  other:          "その他",
};

// ── ID または別名からアイテムを検索 ───────────────────────────
export function findItem(items: ItemMaster[], query: string): ItemMaster | undefined {
  const q = query.trim().toLowerCase();
  return items.find(
    (i) =>
      i.id.toLowerCase() === q ||
      i.name === query.trim() ||
      i.aliases.some((a) => a.toLowerCase() === q)
  );
}

// ── 異常値チェック ─────────────────────────────────────────
export function isAbnormal(item: ItemMaster, value: number): boolean {
  if (item.range.min !== null && value < item.range.min) return true;
  if (item.range.max !== null && value > item.range.max) return true;
  return false;
}

// 異常の種別: 'high'=上限超（赤）/ 'low'=下限未満（青）/ 'normal'=正常
export function getAbnormalType(item: ItemMaster, value: number): "high" | "low" | "normal" {
  if (item.range.max !== null && value > item.range.max) return "high";
  if (item.range.min !== null && value < item.range.min) return "low";
  return "normal";
}
