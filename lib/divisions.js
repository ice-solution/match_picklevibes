const DIVISIONS = [
  { value: "1 - 30+ - 3.0- - 男雙", label: "30歲以上 DUPR 3.0以下 男雙（HK$788/組）" },
  { value: "2 - 30+ - 3.0- - 女雙", label: "30歲以上 DUPR 3.0以下 女雙（HK$788/組）" },
  { value: "3 - 30+ - 3.0- - 混雙", label: "30歲以上 DUPR 3.0以下 混雙（HK$788/組）" },
  { value: "4 - 30+ - 3.0+ - 男雙", label: "30歲以上 DUPR 3.0+ 男雙（HK$788/組）" },
  { value: "5 - 30+ - 3.0+ - 女雙", label: "30歲以上 DUPR 3.0+ 女雙（HK$788/組）" },
  { value: "6 - 30+ - 3.0+ - 混雙", label: "30歲以上 DUPR 3.0+ 混雙（HK$788/組）" },

  { value: "7 - 50+ - 3.0- - 男雙", label: "50歲以上 DUPR 3.0以下 男雙（HK$788/組）" },
  { value: "8 - 50+ - 3.0- - 女雙", label: "50歲以上 DUPR 3.0以下 女雙（HK$788/組）" },
  { value: "9 - 50+ - 3.0- - 混雙", label: "50歲以上 DUPR 3.0以下 混雙（HK$788/組）" },
  { value: "10 - 50+ - 3.0+ - 男雙", label: "50歲以上 DUPR 3.0+ 男雙（HK$788/組）" },
  { value: "11 - 50+ - 3.0+ - 女雙", label: "50歲以上 DUPR 3.0+ 女雙（HK$788/組）" },
  { value: "12 - 50+ - 3.0+ - 混雙", label: "50歲以上 DUPR 3.0+ 混雙（HK$788/組）" },

  { value: "13 - 公開 - - 男雙公開", label: "公開組 男雙（HK$788/組）" },
  { value: "14 - 公開 - - 女雙公開", label: "公開組 女雙（HK$788/組）" },
  { value: "15 - 公開 - - 混雙公開", label: "公開組 混雙（HK$788/組）" },

  { value: "16 - 小朋友 - U8 - -", label: "小朋友 U8（HK$688/組）" },
  { value: "17 - 小朋友 - U10 - -", label: "小朋友 U10（HK$688/組）" },
  { value: "18 - 小朋友 - U12 - -", label: "小朋友 U12（HK$688/組）" },
  { value: "19 - 小朋友 - U14 - -", label: "小朋友 U14（HK$688/組）" }
];

const DIVISION_LABEL_MAP = Object.fromEntries(DIVISIONS.map((d) => [d.value, d.label]));

function divisionLabel(value) {
  const key = String(value || "").trim();
  return DIVISION_LABEL_MAP[key] || "";
}

function divisionLabelOrValue(value) {
  return divisionLabel(value) || String(value || "").trim();
}

module.exports = {
  DIVISIONS,
  divisionLabel,
  divisionLabelOrValue
};

