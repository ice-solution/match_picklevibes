const DIVISIONS = [
  { value: "1 - 30+ - 3.0- - 男雙", label: "30歲以上 DUPR 3.0以下 男雙（24/5（日）Day2｜HK$788/組）" },
  { value: "2 - 30+ - 3.0- - 女雙", label: "30歲以上 DUPR 3.0以下 女雙（24/5（日）Day2｜HK$788/組）" },
  { value: "3 - 30+ - 3.0- - 混雙", label: "30歲以上 DUPR 3.0以下 混雙（24/5（日）Day2｜HK$788/組）" },
  { value: "4 - 30+ - 3.0+ - 男雙", label: "30歲以上 DUPR 3.0+ 男雙（24/5（日）Day2｜HK$788/組）" },
  { value: "5 - 30+ - 3.0+ - 女雙", label: "30歲以上 DUPR 3.0+ 女雙（24/5（日）Day2｜HK$788/組）" },
  { value: "6 - 30+ - 3.0+ - 混雙", label: "30歲以上 DUPR 3.0+ 混雙（24/5（日）Day2｜HK$788/組）" },
  { value: "22 - 30+ - 3.0- - 男單", label: "30歲以上 DUPR 3.0以下 男單（24/5（日）Day2｜HK$388/人）" },

  { value: "7 - 50+ - 3.0- - 男雙", label: "50歲以上 DUPR 3.0以下 男雙（25/5（一）Day3｜HK$788/組）" },
  { value: "8 - 50+ - 3.0- - 女雙", label: "50歲以上 DUPR 3.0以下 女雙（25/5（一）Day3｜HK$788/組）" },
  { value: "9 - 50+ - 3.0- - 混雙", label: "50歲以上 DUPR 3.0以下 混雙（25/5（一）Day3｜HK$788/組）" },
  { value: "10 - 50+ - 3.0+ - 男雙", label: "50歲以上 DUPR 3.0+ 男雙（25/5（一）Day3｜HK$788/組）" },
  { value: "11 - 50+ - 3.0+ - 女雙", label: "50歲以上 DUPR 3.0+ 女雙（25/5（一）Day3｜HK$788/組）" },
  { value: "12 - 50+ - 3.0+ - 混雙", label: "50歲以上 DUPR 3.0+ 混雙（25/5（一）Day3｜HK$788/組）" },

  { value: "13 - 公開 - - 男雙公開", label: "公開組 男雙（23/5（六）Day1｜HK$788/組）" },
  { value: "14 - 公開 - - 女雙公開", label: "公開組 女雙（23/5（六）Day1｜HK$788/組）" },
  { value: "15 - 公開 - - 混雙公開", label: "公開組 混雙（23/5（六）Day1｜HK$788/組）" },
  { value: "21 - 公開 - - 男單公開", label: "公開組 男單（23/5（六）Day1｜HK$388/人）" },

  { value: "16 - 小朋友 - U8 - -", label: "小朋友 U8（8歲或以下）（23/5（六）Day1｜HK$688/組）" },
  { value: "17 - 小朋友 - U10 - -", label: "小朋友 U10（10歲或以下）（23/5（六）Day1｜HK$688/組）" },
  { value: "18 - 小朋友 - U12 - -", label: "小朋友 U12（12歲或以下）（23/5（六）Day1｜HK$688/組）" },
  { value: "19 - 小朋友 - U14 - -", label: "小朋友 U14（14歲或以下）（23/5（六）Day1｜HK$688/組）" },

  { value: "20 - 親子 - - 親子賽", label: "親子組 親子賽（23/5（六）Day1｜HK$688/組）" }
];

const DIVISION_LABEL_MAP = Object.fromEntries(DIVISIONS.map((d) => [d.value, d.label]));

function divisionLabel(value) {
  const key = String(value || "").trim();
  return DIVISION_LABEL_MAP[key] || "";
}

function divisionLabelOrValue(value) {
  return divisionLabel(value) || String(value || "").trim();
}

function isDivisionExemptFromRules(value) {
  const v = String(value || "").trim();
  return v.includes("親子");
}

/** 男單（單打）組別：Stripe 按一人計價 */
function isSinglesDivisionValue(value) {
  const v = String(value || "").trim();
  return v === "21 - 公開 - - 男單公開" || v === "22 - 30+ - 3.0- - 男單";
}

/** Stripe unit_amount：HKD 以「仙」為單位（HK$788 = 78800） */
function divisionFeeCents(value) {
  const v = String(value || "").trim();
  const singles = parseInt(String(process.env.REGISTRATION_FEE_SINGLES_CENTS || "38800").trim(), 10);
  const s = Number.isFinite(singles) && singles > 0 ? singles : 38800;
  const kids = parseInt(String(process.env.REGISTRATION_FEE_KIDS_CENTS || "68800").trim(), 10);
  const def = parseInt(String(process.env.REGISTRATION_FEE_DEFAULT_CENTS || "78800").trim(), 10);
  const k = Number.isFinite(kids) && kids > 0 ? kids : 68800;
  const d = Number.isFinite(def) && def > 0 ? def : 78800;
  if (isSinglesDivisionValue(v)) {
    return s;
  }
  if (
    v.startsWith("16 - 小朋友") ||
    v.startsWith("17 - 小朋友") ||
    v.startsWith("18 - 小朋友") ||
    v.startsWith("19 - 小朋友") ||
    v.startsWith("20 - 親子") ||
    v.includes("親子")
  ) {
    return k;
  }
  return d;
}

module.exports = {
  DIVISIONS,
  divisionLabel,
  divisionLabelOrValue,
  isDivisionExemptFromRules,
  isSinglesDivisionValue,
  divisionFeeCents
};

