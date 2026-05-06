/**
 * 組別字串與兩位球員資料交叉驗證
 * DUPR：2.00–4.00，小數點後 2 位；可選 NR（公開組、3.0- 組別及親子組）
 */

const GENDER = {
  MALE: "male",
  FEMALE: "female"
};

function isParentChildDivision(division) {
  return String(division || "").includes("親子");
}

/** 小朋友組（16–19） */
function isKidsDivision(division) {
  const v = String(division || "").trim();
  return /^1[6-9] - 小朋友/.test(v);
}

/** @param {Date} dob @param {Date} ref */
function ageOnDate(dob, ref) {
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--;
  return age;
}

function parseDuprInput(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return { ok: false, error: "請填寫 DUPR" };
  const n = Number(s);
  if (Number.isNaN(n)) return { ok: false, error: "DUPR 必須為數字" };
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(n * 100 - rounded * 100) > 1e-6) {
    return { ok: false, error: "DUPR 請填至小數點後 2 位" };
  }
  if (rounded < 2.0 || rounded > 4.0) {
    return { ok: false, error: "DUPR 必須介乎 2.00 至 4.00" };
  }
  return { ok: true, value: rounded };
}

function allowNRForDivision(division) {
  if (isParentChildDivision(division)) return true;
  const rule = RULES[String(division || "").trim()];
  if (!rule) return false;
  // NR 可以報：公開組 (age=open) 或 3.0- 組別
  return rule.age === "open" || rule.dupr === "3.0-";
}

/**
 * @param {string} division - option value
 * @param {{ dateOfBirth: Date, gender: string, dupr: number }} p1
 * @param {{ dateOfBirth: Date, gender: string, dupr: number }} p2
 * @param {Date} refDate - 計算年齡參考日（通常為賽事首日）
 */
function validateDivisionPlayers(division, p1, p2, refDate) {
  const errors = [];
  // 親子組不做組別規則檢查（年齡／DUPR／性別皆不核對）
  if (isParentChildDivision(division)) return { ok: true, errors: [] };
  const rule = RULES[division];
  if (!rule) {
    errors.push("無法識別所選組別，請重新選擇");
    return { ok: false, errors };
  }

  const kidDiv = isKidsDivision(division);
  const p1nr = p1 && p1.duprNR === true;
  const p2nr = p2 && p2.duprNR === true;
  const p1kidSkip = p1 && p1.duprKidSkip === true;
  const p2kidSkip = p2 && p2.duprKidSkip === true;

  if (!kidDiv && (p1kidSkip || p2kidSkip)) {
    errors.push("「沒有 DUPR 積分」只適用於小朋友組別");
    return { ok: false, errors };
  }

  if (kidDiv && (p1nr || p2nr)) {
    errors.push("小朋友組不適用 NR；如沒有 DUPR 積分請勾選「沒有 DUPR 積分」");
    return { ok: false, errors };
  }

  const nrAllowed = allowNRForDivision(division);
  if (!kidDiv && (p1nr || p2nr) && !nrAllowed) {
    errors.push("此組別不接受 NR，請填寫 DUPR");
    return { ok: false, errors };
  }

  let dup1;
  let dup2;
  if (kidDiv) {
    const raw1 = p1kidSkip ? null : (p1.duprRaw != null ? p1.duprRaw : p1.dupr);
    const raw2 = p2kidSkip ? null : (p2.duprRaw != null ? p2.duprRaw : p2.dupr);
    dup1 = p1kidSkip ? { ok: true, value: null } : parseDuprInput(raw1);
    dup2 = p2kidSkip ? { ok: true, value: null } : parseDuprInput(raw2);
  } else {
    const raw1 = p1nr ? null : (p1.duprRaw != null ? p1.duprRaw : p1.dupr);
    const raw2 = p2nr ? null : (p2.duprRaw != null ? p2.duprRaw : p2.dupr);
    dup1 = p1nr ? { ok: true, value: null } : parseDuprInput(raw1);
    dup2 = p2nr ? { ok: true, value: null } : parseDuprInput(raw2);
  }
  if (!dup1.ok) errors.push(`球員 1：${dup1.error}`);
  if (!dup2.ok) errors.push(`球員 2：${dup2.error}`);
  if (errors.length) return { ok: false, errors };

  const d1 = dup1.value;
  const d2 = dup2.value;

  for (const [label, d] of [
    ["球員 1", d1],
    ["球員 2", d2]
  ]) {
    if (rule.dupr === "3.0-") {
      if (d == null) continue; // NR allowed here
      if (!(d < 3.0)) errors.push(`${label}：此組別要求 DUPR 3.0 以下（< 3.00），目前為 ${d.toFixed(2)}`);
    } else if (rule.dupr === "3.0+") {
      // 3.0+ 不接受 NR
      if (d == null) errors.push(`${label}：此組別不接受 NR，請填寫 DUPR`);
      else if (!(d >= 3.0)) errors.push(`${label}：此組別要求 DUPR 3.0 或以上（≥ 3.00），目前為 ${d.toFixed(2)}`);
    }
  }

  const a1 = ageOnDate(p1.dateOfBirth, refDate);
  const a2 = ageOnDate(p2.dateOfBirth, refDate);

  if (rule.age === "30+") {
    if (a1 < 30) errors.push(`球員 1：依出生日期計算為 ${a1} 歲，未達 30+ 組別要求（需年滿 30 歲）`);
    if (a2 < 30) errors.push(`球員 2：依出生日期計算為 ${a2} 歲，未達 30+ 組別要求（需年滿 30 歲）`);
  } else if (rule.age === "50+") {
    if (a1 < 50) errors.push(`球員 1：依出生日期計算為 ${a1} 歲，未達 50+ 組別要求（需年滿 50 歲）`);
    if (a2 < 50) errors.push(`球員 2：依出生日期計算為 ${a2} 歲，未達 50+ 組別要求（需年滿 50 歲）`);
  } else if (rule.age === "open") {
    // 公開組不限制年齡
  } else if (typeof rule.age === "number") {
    const max = rule.age;
    // 小朋友 U8／U10／U12／U14：各組為「該歲或以下」（含滿該歲）；非小朋友之數字 age 仍為「未滿」
    if (kidDiv) {
      if (a1 > max) {
        errors.push(
          `球員 1：依賽事年齡參考日計算為 ${a1} 歲，不符合所選小朋友組別（需為 ${max} 歲或以下）`
        );
      }
      if (a2 > max) {
        errors.push(
          `球員 2：依賽事年齡參考日計算為 ${a2} 歲，不符合所選小朋友組別（需為 ${max} 歲或以下）`
        );
      }
    } else {
      if (a1 >= max) errors.push(`球員 1：依出生日期計算為 ${a1} 歲，不符合 U${max} 組別（需未滿 ${max} 歲）`);
      if (a2 >= max) errors.push(`球員 2：依出生日期計算為 ${a2} 歲，不符合 U${max} 組別（需未滿 ${max} 歲）`);
    }
  }

  const g1 = p1.gender;
  const g2 = p2.gender;
  if (rule.pair === "MM") {
    if (g1 !== GENDER.MALE || g2 !== GENDER.MALE) errors.push("男雙組別：兩位球員性別均需為男性");
  } else if (rule.pair === "FF") {
    if (g1 !== GENDER.FEMALE || g2 !== GENDER.FEMALE) errors.push("女雙組別：兩位球員性別均需為女性");
  } else if (rule.pair === "MF") {
    const ok =
      (g1 === GENDER.MALE && g2 === GENDER.FEMALE) ||
      (g1 === GENDER.FEMALE && g2 === GENDER.MALE);
    if (!ok) errors.push("混雙組別：需一位男性及一位女性球員");
  } else if (rule.pair === "OPEN_M") {
    if (g1 !== GENDER.MALE || g2 !== GENDER.MALE) errors.push("男雙公開組：兩位球員性別均需為男性");
  } else if (rule.pair === "OPEN_F") {
    if (g1 !== GENDER.FEMALE || g2 !== GENDER.FEMALE) errors.push("女雙公開組：兩位球員性別均需為女性");
  } else if (rule.pair === "OPEN_MF") {
    const ok =
      (g1 === GENDER.MALE && g2 === GENDER.FEMALE) ||
      (g1 === GENDER.FEMALE && g2 === GENDER.MALE);
    if (!ok) errors.push("混雙公開組：需一位男性及一位女性球員");
  } else if (rule.pair === "ANY") {
    // 小朋友組：不限制組合性別
  }

  return { ok: errors.length === 0, errors };
}

/**
 * dupr: '3.0-' | '3.0+' | 'any'
 * age: '30+' | '50+' | 'open' | 8 | 10 | 12 | 14（小朋友：U8＝8歲或以下、U10＝10歲或以下、U12＝12歲或以下、U14＝14歲或以下；非小朋友之數字 age 仍為未滿）
 * pair: MM | FF | MF | OPEN_M | OPEN_F | OPEN_MF | ANY
 */
const RULES = {
  "1 - 30+ - 3.0- - 男雙": { dupr: "3.0-", age: "30+", pair: "MM" },
  "2 - 30+ - 3.0- - 女雙": { dupr: "3.0-", age: "30+", pair: "FF" },
  "3 - 30+ - 3.0- - 混雙": { dupr: "3.0-", age: "30+", pair: "MF" },
  "4 - 30+ - 3.0+ - 男雙": { dupr: "3.0+", age: "30+", pair: "MM" },
  "5 - 30+ - 3.0+ - 女雙": { dupr: "3.0+", age: "30+", pair: "FF" },
  "6 - 30+ - 3.0+ - 混雙": { dupr: "3.0+", age: "30+", pair: "MF" },
  "7 - 50+ - 3.0- - 男雙": { dupr: "3.0-", age: "50+", pair: "MM" },
  "8 - 50+ - 3.0- - 女雙": { dupr: "3.0-", age: "50+", pair: "FF" },
  "9 - 50+ - 3.0- - 混雙": { dupr: "3.0-", age: "50+", pair: "MF" },
  "10 - 50+ - 3.0+ - 男雙": { dupr: "3.0+", age: "50+", pair: "MM" },
  "11 - 50+ - 3.0+ - 女雙": { dupr: "3.0+", age: "50+", pair: "FF" },
  "12 - 50+ - 3.0+ - 混雙": { dupr: "3.0+", age: "50+", pair: "MF" },
  "13 - 公開 - - 男雙公開": { dupr: "any", age: "open", pair: "OPEN_M" },
  "14 - 公開 - - 女雙公開": { dupr: "any", age: "open", pair: "OPEN_F" },
  "15 - 公開 - - 混雙公開": { dupr: "any", age: "open", pair: "OPEN_MF" },
  "16 - 小朋友 - U8 - -": { dupr: "any", age: 8, pair: "ANY" },
  "17 - 小朋友 - U10 - -": { dupr: "any", age: 10, pair: "ANY" },
  "18 - 小朋友 - U12 - -": { dupr: "any", age: 12, pair: "ANY" },
  "19 - 小朋友 - U14 - -": { dupr: "any", age: 14, pair: "ANY" }
};

module.exports = {
  GENDER,
  isParentChildDivision,
  isKidsDivision,
  ageOnDate,
  parseDuprInput,
  allowNRForDivision,
  validateDivisionPlayers,
  RULES
};
