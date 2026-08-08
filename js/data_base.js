/* =====================================================
 * 《周易》基础数据：八卦、八宫卦序、纳甲、五行、六神
 * 爻线编码：1 = 阳爻（—），0 = 阴爻（--），自下而上排列
 * ===================================================== */

/* ---------- 八卦基础 ---------- */
const TRIGRAMS = {
  "乾": { lines: "111", nature: "天", virtue: "健", element: "金", xiantian: 1, houtianDir: "西北", symbol: "☰", image: "天行健，君子以自强不息", classification: "天、君、父、大人、刚健、圆、玉、金、首、马" },
  "兑": { lines: "110", nature: "泽", virtue: "说（悦）", element: "金", xiantian: 2, houtianDir: "西", symbol: "☱", image: "丽泽，兑；君子以朋友讲习", classification: "泽、少女、口舌、喜悦、羊、口、巫、妾" },
  "离": { lines: "101", nature: "火", virtue: "丽", element: "火", xiantian: 3, houtianDir: "南", symbol: "☲", image: "明两作，离；大人以继明照于四方", classification: "火、日、电、中女、文明、明、目、雉、蚌" },
  "震": { lines: "100", nature: "雷", virtue: "动", element: "木", xiantian: 4, houtianDir: "东", symbol: "☳", image: "洊雷，震；君子以恐惧修省", classification: "雷、长男、动、足、龙、青、竹、苇" },
  "巽": { lines: "011", nature: "风", virtue: "入", element: "木", xiantian: 5, houtianDir: "东南", symbol: "☴", image: "随风，巽；君子以申命行事", classification: "风、长女、入、股、鸡、木、白、绳直" },
  "坎": { lines: "010", nature: "水", virtue: "陷", element: "水", xiantian: 6, houtianDir: "北", symbol: "☵", image: "水洊至，习坎；君子以常德行，习教事", classification: "水、中男、险、陷、耳、豕、弓轮、沟渎" },
  "艮": { lines: "001", nature: "山", virtue: "止", element: "土", xiantian: 7, houtianDir: "东北", symbol: "☶", image: "兼山，艮；君子以思不出其位", classification: "山、少男、止、手、狗、径路、小石、门阙" },
  "坤": { lines: "000", nature: "地", virtue: "顺", element: "土", xiantian: 8, houtianDir: "西南", symbol: "☷", image: "地势坤，君子以厚德载物", classification: "地、母、顺、柔、众、布、釜、牛、大舆、文" }
};

/* ---------- 八卦纳甲（自下而上六爻干支） ----------
 * 乾纳甲壬、坤纳乙癸、震纳庚、巽纳辛、坎纳戊、离纳己、艮纳丙、兑纳丁 */
const NAJIA = {
  "乾": { inner: ["甲子", "甲寅", "甲辰"], outer: ["壬午", "壬申", "壬戌"] },
  "坤": { inner: ["乙未", "乙巳", "乙卯"], outer: ["癸丑", "癸亥", "癸酉"] },
  "震": { inner: ["庚子", "庚寅", "庚辰"], outer: ["庚午", "庚申", "庚戌"] },
  "巽": { inner: ["辛丑", "辛亥", "辛酉"], outer: ["辛未", "辛巳", "辛卯"] },
  "坎": { inner: ["戊寅", "戊辰", "戊午"], outer: ["戊申", "戊戌", "戊子"] },
  "离": { inner: ["己卯", "己丑", "己亥"], outer: ["己酉", "己未", "己巳"] },
  "艮": { inner: ["丙辰", "丙午", "丙申"], outer: ["丙戌", "丙子", "丙寅"] },
  "兑": { inner: ["丁巳", "丁卯", "丁丑"], outer: ["丁亥", "丁酉", "丁未"] }
};

/* ---------- 八宫卦序（京房） ----------
 * 每宫八卦：本宫、一世、二世、三世、四世、五世、游魂、归魂
 * 元素代表宫之五行（“我”） */
const PALACES = [
  { name: "乾宫", element: "金", hexes: [1, 44, 33, 12, 20, 23, 35, 14] },
  { name: "坎宫", element: "水", hexes: [29, 60, 3, 63, 49, 55, 36, 7] },
  { name: "艮宫", element: "土", hexes: [52, 22, 26, 41, 38, 10, 61, 53] },
  { name: "震宫", element: "木", hexes: [51, 16, 40, 32, 46, 48, 28, 17] },
  { name: "巽宫", element: "木", hexes: [57, 9, 37, 42, 25, 21, 27, 18] },
  { name: "离宫", element: "火", hexes: [30, 56, 50, 64, 4, 59, 6, 13] },
  { name: "坤宫", element: "土", hexes: [2, 24, 19, 11, 34, 43, 5, 8] },
  { name: "兑宫", element: "金", hexes: [58, 47, 45, 31, 39, 15, 62, 54] }
];

/* 宫中第几卦 → 世爻位（初爻为1，上爻为6） */
const SHI_POS = [6, 1, 2, 3, 4, 5, 4, 3];
/* 应爻与世爻隔三位 */
const YING_POS = [3, 4, 5, 6, 1, 2, 1, 6];

/* ---------- 五行 ---------- */
const ELEMENT_GAN = { "甲": "木", "乙": "木", "丙": "火", "丁": "火", "戊": "土", "己": "土", "庚": "金", "辛": "金", "壬": "水", "癸": "水" };
const ELEMENT_ZHI = { "子": "水", "丑": "土", "寅": "木", "卯": "木", "辰": "土", "巳": "火", "午": "火", "未": "土", "申": "金", "酉": "金", "戌": "土", "亥": "水" };
const ZHI_ORDER = { "子": 1, "丑": 2, "寅": 3, "卯": 4, "辰": 5, "巳": 6, "午": 7, "未": 8, "申": 9, "酉": 10, "戌": 11, "亥": 12 };
const GAN_ORDER = { "甲": 1, "乙": 2, "丙": 3, "丁": 4, "戊": 5, "己": 6, "庚": 7, "辛": 8, "壬": 9, "癸": 10 };

/* 五行生克关系 */
const SHENG = { "木": "火", "火": "土", "土": "金", "金": "水", "水": "木" };
const KE = { "木": "土", "土": "水", "水": "火", "火": "金", "金": "木" };

/* ---------- 六神（按日干顺布） ---------- */
const LIUSHEN = {
  "甲乙": ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"],
  "丙丁": ["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"],
  "戊": ["勾陈", "螣蛇", "白虎", "玄武", "青龙", "朱雀"],
  "己": ["螣蛇", "白虎", "玄武", "青龙", "朱雀", "勾陈"],
  "庚辛": ["白虎", "玄武", "青龙", "朱雀", "勾陈", "螣蛇"],
  "壬癸": ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"]
};
function getLiushanKey(gan) {
  if (gan === "甲" || gan === "乙") return "甲乙";
  if (gan === "丙" || gan === "丁") return "丙丁";
  if (gan === "庚" || gan === "辛") return "庚辛";
  if (gan === "壬" || gan === "癸") return "壬癸";
  return gan; // 戊 或 己
}

/* ---------- 六亲（以宫五行“我”与爻五行相较） ---------- */
function getLiuqin(meElement, yaoElement) {
  if (meElement === yaoElement) return "兄弟";
  if (SHENG[meElement] === yaoElement) return "子孙";   // 我生者子孙
  if (SHENG[yaoElement] === meElement) return "父母";   // 生我者父母
  if (KE[meElement] === yaoElement) return "妻财";      // 我克者妻财
  if (KE[yaoElement] === meElement) return "官鬼";      // 克我者官鬼
  return "";
}

/* ---------- 地支六合/六冲（进阶参考） ---------- */
const LIUHE = { "子": "丑", "丑": "子", "寅": "亥", "亥": "寅", "卯": "戌", "戌": "卯", "辰": "酉", "酉": "辰", "巳": "申", "申": "巳", "午": "未", "未": "午" };
const LIUCHONG = { "子": "午", "午": "子", "丑": "未", "未": "丑", "寅": "申", "申": "寅", "卯": "酉", "酉": "卯", "辰": "戌", "戌": "辰", "巳": "亥", "亥": "巳" };

/* ---------- 工具函数 ---------- */

/** 根据上下卦名得六爻线（自下而上），如 {upper:'乾', lower:'坤'} → "000111" */
function buildHexLines(upper, lower) {
  return TRIGRAMS[lower].lines + TRIGRAMS[upper].lines;
}

/** 根据六爻线求上卦名、下卦名 */
function linesToTrigrams(lines) {
  const lower = lines.slice(0, 3), upper = lines.slice(3, 6);
  const lowerName = Object.keys(TRIGRAMS).find(k => TRIGRAMS[k].lines === lower);
  const upperName = Object.keys(TRIGRAMS).find(k => TRIGRAMS[k].lines === upper);
  return { upper: upperName, lower: lowerName };
}

/** 六爻线 → 二进制数值（阳1阴0，下爻为最高位） */
function linesToValue(lines) {
  let v = 0;
  for (let i = 0; i < 6; i++) v |= (lines[5 - i] === "1" ? 1 : 0) << i;
  return v;
}

/** 查卦（按卦序id 或 卦名） */
function getHexById(id) {
  return HEXAGRAMS[id - 1] || null;
}
function getHexByName(name) {
  return HEXAGRAMS.find(h => h.name === name || h.title.includes(name)) || null;
}

/** 求八宫信息（宫名、位置、世应） */
function getPalaceInfo(hexId) {
  for (let i = 0; i < PALACES.length; i++) {
    const idx = PALACES[i].hexes.indexOf(hexId);
    if (idx >= 0) {
      return { palace: PALACES[i], index: idx, shi: SHI_POS[idx], ying: YING_POS[idx] };
    }
  }
  return null;
}

/** 起卦日干支（近似：以1900年1月31日为甲子日起算） */
function dayGanzhi(date) {
  const base = new Date(1900, 0, 31); // 甲子日
  const diff = Math.round((date.getTime() - base.getTime()) / 86400000);
  const gan = (diff % 10 + 10) % 10;
  const zhi = (diff % 12 + 12) % 12;
  const ganArr = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const zhiArr = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  return ganArr[gan] + zhiArr[zhi];
}

/** 年支序数（梅花时间起卦用） */
function yearZhiOrder(year) {
  // 以立春为界近似处理：取公历年份对应地支（1900庚子…，用简表即可，误差仅在年初数日）
  const arr = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  // 1984年为甲子年，地支序数 = ((year - 1984) % 12 + 12) % 12 + 1
  return (((year - 1984) % 12) + 12) % 12 + 1;
}

/** 由上下卦名查卦序（惰性，需在 HEXAGRAMS 定义后调用） */
function getHexByTrigrams(upper, lower) {
  if (typeof HEXAGRAMS === "undefined") return null;
  return HEXAGRAMS.find(h => h.upper === upper && h.lower === lower) || null;
}
