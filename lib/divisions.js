const DIVISIONS = [
  { value: "1 - 30+ - 3.0- - 男雙", label: "30歲以上 DUPR 3.0以下 男雙（24/5（日）Day2｜HK$788/組）" },
  { value: "2 - 30+ - 3.0- - 女雙", label: "30歲以上 DUPR 3.0以下 女雙（24/5（日）Day2｜HK$788/組）" },
  { value: "3 - 30+ - 3.0- - 混雙", label: "30歲以上 DUPR 3.0以下 混雙（24/5（日）Day2｜HK$788/組）" },
  { value: "4 - 30+ - 3.0+ - 男雙", label: "30歲以上 DUPR 3.0+ 男雙（24/5（日）Day2｜HK$788/組）" },
  { value: "5 - 30+ - 3.0+ - 女雙", label: "30歲以上 DUPR 3.0+ 女雙（24/5（日）Day2｜HK$788/組）" },
  { value: "6 - 30+ - 3.0+ - 混雙", label: "30歲以上 DUPR 3.0+ 混雙（24/5（日）Day2｜HK$788/組）" },

  { value: "7 - 50+ - 3.0- - 男雙", label: "50歲以上 DUPR 3.0以下 男雙（25/5（一）Day3｜HK$788/組）" },
  { value: "8 - 50+ - 3.0- - 女雙", label: "50歲以上 DUPR 3.0以下 女雙（25/5（一）Day3｜HK$788/組）" },
  { value: "9 - 50+ - 3.0- - 混雙", label: "50歲以上 DUPR 3.0以下 混雙（25/5（一）Day3｜HK$788/組）" },
  { value: "10 - 50+ - 3.0+ - 男雙", label: "50歲以上 DUPR 3.0+ 男雙（25/5（一）Day3｜HK$788/組）" },
  { value: "11 - 50+ - 3.0+ - 女雙", label: "50歲以上 DUPR 3.0+ 女雙（25/5（一）Day3｜HK$788/組）" },
  { value: "12 - 50+ - 3.0+ - 混雙", label: "50歲以上 DUPR 3.0+ 混雙（25/5（一）Day3｜HK$788/組）" },

  { value: "13 - 公開 - - 男雙公開", label: "公開組 男雙（23/5（六）Day1｜HK$788/組）" },
  { value: "14 - 公開 - - 女雙公開", label: "公開組 女雙（23/5（六）Day1｜HK$788/組）" },
  { value: "15 - 公開 - - 混雙公開", label: "公開組 混雙（23/5（六）Day1｜HK$788/組）" },

  { value: "16 - 小朋友 - U8 - -", label: "小朋友 U8（23/5（六）Day1｜HK$688/組）" },
  { value: "17 - 小朋友 - U10 - -", label: "小朋友 U10（23/5（六）Day1｜HK$688/組）" },
  { value: "18 - 小朋友 - U12 - -", label: "小朋友 U12（23/5（六）Day1｜HK$688/組）" },
  { value: "19 - 小朋友 - U14 - -", label: "小朋友 U14（23/5（六）Day1｜HK$688/組）" },

  { value: "20 - 親子 - - 親子賽", label: "親子組 親子賽（23/5（六）Day1｜HK$788/組）" }
];

const DIVISION_LABEL_MAP = Object.fromEntries(DIVISIONS.map((d) => [d.value, d.label]));

function divisionLabel(value) {
  const key = String(value || "").trim();
  return DIVISION_LABEL_MAP[key] || "";
}

function divisionLabelOrValue(value) {
  return divisionLabel(value) || String(value || "").trim();
}

function divisionCapacity(value) {
  const v = String(value || "").trim();
  // 小朋友組、親子組：4 隊；其他：6 隊
  if (v.startsWith("16 - 小朋友") || v.startsWith("17 - 小朋友") || v.startsWith("18 - 小朋友") || v.startsWith("19 - 小朋友")) {
    return 4;
  }
  if (v.includes("親子")) return 4;
  return 6;
}

function isDivisionExemptFromRules(value) {
  const v = String(value || "").trim();
  return v.includes("親子");
}

module.exports = {
  DIVISIONS,
  divisionLabel,
  divisionLabelOrValue,
  divisionCapacity,
  isDivisionExemptFromRules
};

