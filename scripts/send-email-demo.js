#!/usr/bin/env node
/**
 * 發送示範電郵給自己（需 .env 內 EMAIL_* 設定正確）。
 *
 * 用法：
 *   npm run email:demo -- --to you@example.com
 *   npm run email:demo -- --to you@example.com --kind payment
 *   npm run email:demo -- --to you@example.com --both
 *
 * 省略 --to 時：優先 EMAIL_DEMO_TO，否則使用 EMAIL_USER（通常即 SMTP 帳號）。
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const {
  sendRegistrationEmail,
  sendPaymentRequestEmail
} = require("../lib/email");

function parseArgs(argv) {
  let to = "";
  let kind = "registration"; // registration | payment | both
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--to" && argv[i + 1]) {
      to = String(argv[++i]).trim();
    } else if (a === "--kind" && argv[i + 1]) {
      kind = String(argv[++i]).trim().toLowerCase();
    } else if (a === "--both") {
      kind = "both";
    }
  }
  return { to, kind };
}

function tournamentFromEnv() {
  return {
    name: process.env.TOURNAMENT_NAME || "PickleVibes 匹克球公開賽",
    date: process.env.TOURNAMENT_DATE || "TBD",
    location: process.env.TOURNAMENT_LOCATION || "TBD"
  };
}

function demoRegistration(toEmail) {
  return {
    division: "4 - 30+ - 3.0+ - 男雙",
    fullName: "CLI Demo 聯絡人",
    email: toEmail,
    phone: "91234567",
    referrerPhone: "92345678",
    bocReferralCode: process.env.BOC_EXPECTED_REFERRAL_CODE || "BOCLP26",
    notes: "此為 scripts/send-email-demo.js 示範郵件，可忽略。",
    player1: {
      name: "示範球員甲",
      dateOfBirth: new Date("1995-06-01"),
      gender: "male",
      dupr: 3.25,
      duprNR: false,
      kidNoDuprScore: false
    },
    player2: {
      name: "示範球員乙",
      dateOfBirth: new Date("1998-03-15"),
      gender: "female",
      dupr: null,
      duprNR: true,
      kidNoDuprScore: false
    }
  };
}

async function main() {
  const { to: argTo, kind } = parseArgs(process.argv);
  const to =
    argTo ||
    String(process.env.EMAIL_DEMO_TO || process.env.EMAIL_USER || "").trim();

  if (!to) {
    console.error("請指定收件地址：--to you@example.com\n或在 .env 設定 EMAIL_DEMO_TO 或 EMAIL_USER。");
    process.exit(1);
  }

  if (!["registration", "payment", "both"].includes(kind)) {
    console.error("--kind 須為 registration | payment | both");
    process.exit(1);
  }

  const tournament = tournamentFromEnv();
  const reg = demoRegistration(to);
  const publicBaseUrl = String(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  try {
    if (kind === "registration" || kind === "both") {
      const r = await sendRegistrationEmail({ tournament, reg });
      if (!r.ok) throw new Error(r.error || "sendRegistrationEmail failed");
      console.log("✓ 已發送【登記完成】示範電郵 →", to);
    }

    if (kind === "payment" || kind === "both") {
      const checkoutUrl = `${publicBaseUrl}/payment/demo-checkout-placeholder`;
      const r = await sendPaymentRequestEmail({
        tournament,
        reg,
        checkoutUrl,
        amountCents: null,
        publicBaseUrl
      });
      if (!r.ok) throw new Error(r.error || "sendPaymentRequestEmail failed");
      console.log("✓ 已發送【付款通知】示範電郵 →", to);
    }
  } catch (e) {
    console.error("發送失敗：", e.message || e);
    process.exit(1);
  }
}

main();
