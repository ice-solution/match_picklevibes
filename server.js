const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
require("dotenv").config();
const XLSX = require("xlsx");

const Registration = require("./models/Registration");
const { sendRegistrationEmail } = require("./lib/email");
const { divisionLabelOrValue } = require("./lib/divisions");
const {
  GENDER,
  parseDuprInput,
  allowNRForDivision,
  validateDivisionPlayers
} = require("./lib/divisionRules");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret";
const ADMIN_USER = String(process.env.ADMIN_USER || "").trim();
const ADMIN_PASS = String(process.env.ADMIN_PASS || "").trim();
/** 報名表 BOC 推薦碼必須與此完全一致（可用 .env 的 BOC_EXPECTED_REFERRAL_CODE 覆寫） */
const BOC_EXPECTED_REFERRAL_CODE = String(
  process.env.BOC_EXPECTED_REFERRAL_CODE || "BOCLP26"
).trim();

const TOURNAMENT = {
  name: process.env.TOURNAMENT_NAME || "PickleVibes 匹克球公開賽",
  date: process.env.TOURNAMENT_DATE || "TBD",
  location: process.env.TOURNAMENT_LOCATION || "TBD"
};

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env");
}

function getAgeReferenceDate() {
  const explicit = process.env.TOURNAMENT_AGE_REFERENCE_DATE;
  if (explicit) {
    const d = new Date(explicit);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const td = String(process.env.TOURNAMENT_DATE || "").trim();
  const first = td.split(/\s*至\s*/)[0]?.trim() || td;
  const d = new Date(first);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}

function getRegistrationDeadline() {
  const raw = process.env.REGISTRATION_DEADLINE;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isRegistrationOpen() {
  const end = getRegistrationDeadline();
  if (!end) return true;
  return Date.now() <= end.getTime();
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // eslint-disable-next-line global-require
  return require("stripe")(key);
}

function stripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

function baseUrl(req) {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// Stripe 已停用（保留 env 可能仍存在，但流程不再使用）

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.set("trust proxy", 1);

app.use(
  session({
    name: "pv_admin",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: 1000 * 60 * 60 * 8 // 8 小時
    }
  })
);

// Stripe Webhook：必須用 raw body 驗證簽名
// Stripe webhook 已停用

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`);
}

function adminConfigured() {
  return Boolean(ADMIN_USER && ADMIN_PASS);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function defaultApplyValues() {
  return {
    fullName: "",
    email: "",
    phone: "",
    bocReferralCode: "",
    division: "",
    notes: "",
    consentAccepted: "",
    player1Name: "",
    player1Dob: "",
    player1Gender: "",
    player1DuprNR: "",
    player1Dupr: "",
    player2Name: "",
    player2Dob: "",
    player2Gender: "",
    player2DuprNR: "",
    player2Dupr: ""
  };
}

function renderApply(res, locals) {
  return res.render("pages/apply", {
    tournament: TOURNAMENT,
    registrationDeadline: getRegistrationDeadline(),
    expectedBocCode: BOC_EXPECTED_REFERRAL_CODE,
    ...locals
  });
}

app.get("/", (req, res) => {
  res.render("pages/home", {
    tournament: TOURNAMENT,
    registrationDeadline: getRegistrationDeadline(),
    registrationOpen: isRegistrationOpen()
  });
});

app.get("/apply", (req, res) => {
  if (!isRegistrationOpen()) {
    return res.status(403).render("pages/closed", {
      tournament: TOURNAMENT,
      registrationDeadline: getRegistrationDeadline()
    });
  }
  renderApply(res, {
    values: defaultApplyValues(),
    errors: {},
    errorList: [],
    cancelled: false
  });
});

app.post("/apply", async (req, res) => {
  if (!isRegistrationOpen()) {
    return res.status(403).render("pages/closed", {
      tournament: TOURNAMENT,
      registrationDeadline: getRegistrationDeadline()
    });
  }

  const values = {
    fullName: String(req.body.fullName || "").trim(),
    email: normalizeEmail(req.body.email),
    phone: String(req.body.phone || "").trim(),
    bocReferralCode: String(req.body.bocReferralCode || "").trim(),
    division: String(req.body.division || "").trim(),
    notes: String(req.body.notes || "").trim(),
    consentAccepted: String(req.body.consentAccepted || "").trim(),
    player1Name: String(req.body.player1Name || "").trim(),
    player1Dob: String(req.body.player1Dob || "").trim(),
    player1Gender: String(req.body.player1Gender || "").trim(),
    player1DuprNR: String(req.body.player1DuprNR || "").trim(),
    player1Dupr: String(req.body.player1Dupr || "").trim(),
    player2Name: String(req.body.player2Name || "").trim(),
    player2Dob: String(req.body.player2Dob || "").trim(),
    player2Gender: String(req.body.player2Gender || "").trim(),
    player2DuprNR: String(req.body.player2DuprNR || "").trim(),
    player2Dupr: String(req.body.player2Dupr || "").trim()
  };

  const errors = {};
  if (!values.fullName) errors.fullName = "請填寫聯絡人姓名";
  if (!values.email) errors.email = "請填寫電郵";
  if (values.email && !isValidEmail(values.email)) errors.email = "電郵格式不正確";
  if (!values.phone) errors.phone = "請填寫電話";
  if (!values.bocReferralCode) errors.bocReferralCode = "請填寫推廣碼";
  else if (values.bocReferralCode !== BOC_EXPECTED_REFERRAL_CODE) {
    errors.bocReferralCode = "推廣碼不符合";
  }
  if (!values.division) errors.division = "請選擇組別";
  if (values.consentAccepted !== "on") errors.consentAccepted = "你必須同意個人資料收集聲明才可提交";

  if (!values.player1Name) errors.player1Name = "請填寫球員 1 姓名";
  if (!values.player2Name) errors.player2Name = "請填寫球員 2 姓名";

  const p1dob = safeDate(values.player1Dob);
  if (!p1dob) errors.player1Dob = "請選擇球員 1 出生日期";
  const p2dob = safeDate(values.player2Dob);
  if (!p2dob) errors.player2Dob = "請選擇球員 2 出生日期";

  if (!values.player1Gender) errors.player1Gender = "請選擇球員 1 性別";
  if (!values.player2Gender) errors.player2Gender = "請選擇球員 2 性別";
  if (
    values.player1Gender &&
    values.player1Gender !== GENDER.MALE &&
    values.player1Gender !== GENDER.FEMALE
  ) {
    errors.player1Gender = "性別無效";
  }
  if (
    values.player2Gender &&
    values.player2Gender !== GENDER.MALE &&
    values.player2Gender !== GENDER.FEMALE
  ) {
    errors.player2Gender = "性別無效";
  }

  const p1nr = values.player1DuprNR === "on";
  const p2nr = values.player2DuprNR === "on";
  const nrAllowed = allowNRForDivision(values.division);
  if ((p1nr || p2nr) && !nrAllowed) {
    errors.player1Dupr = "此組別不接受 NR，請填寫 DUPR";
    errors.player2Dupr = "此組別不接受 NR，請填寫 DUPR";
  }

  const dup1 = p1nr ? { ok: true, value: null } : parseDuprInput(values.player1Dupr);
  const dup2 = p2nr ? { ok: true, value: null } : parseDuprInput(values.player2Dupr);
  if (!p1nr && !dup1.ok) errors.player1Dupr = dup1.error || "DUPR 無效";
  if (!p2nr && !dup2.ok) errors.player2Dupr = dup2.error || "DUPR 無效";

  const refDate = getAgeReferenceDate();
  let divisionErrors = [];
  if (
    !Object.keys(errors).length &&
    p1dob &&
    p2dob &&
    values.player1Gender &&
    values.player2Gender &&
    values.division &&
    dup1.ok &&
    dup2.ok
  ) {
    const v = validateDivisionPlayers(
      values.division,
      {
        dateOfBirth: p1dob,
        gender: values.player1Gender,
        duprNR: p1nr,
        duprRaw: values.player1Dupr
      },
      {
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        duprNR: p2nr,
        duprRaw: values.player2Dupr
      },
      refDate
    );
    if (!v.ok) divisionErrors = v.errors;
  }

  const errorList = [...divisionErrors];
  if (Object.keys(errors).length || errorList.length) {
    return renderApply(res.status(400), {
      values,
      errors,
      errorList,
      cancelled: false
    });
  }

  try {
    const doc = {
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      bocReferralCode: values.bocReferralCode,
      player1: {
        name: values.player1Name,
        dateOfBirth: p1dob,
        gender: values.player1Gender,
        duprNR: p1nr,
        dupr: dup1.value
      },
      player2: {
        name: values.player2Name,
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        duprNR: p2nr,
        dupr: dup2.value
      },
      division: values.division,
      tournamentName: TOURNAMENT.name,
      tournamentDate: TOURNAMENT.date,
      tournamentLocation: TOURNAMENT.location,
      notes: values.notes,
      consentAccepted: true,
      consentAcceptedAt: new Date()
    };

    const created = await Registration.create(doc);

    try {
      await sendRegistrationEmail({ tournament: TOURNAMENT, reg: created.toObject() });
      await Registration.findByIdAndUpdate(created._id, {
        emailSentAt: new Date(),
        emailSendError: ""
      });
    } catch (emailErr) {
      await Registration.findByIdAndUpdate(created._id, {
        emailSentAt: null,
        emailSendError: String(emailErr && emailErr.message ? emailErr.message : emailErr || "email send failed")
      });
      // 電郵失敗不阻斷報名流程，改為成功頁提示用戶保留頁面
    }

    return res.redirect(`/success?rid=${created._id.toString()}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("apply submit failed:", err);
    const message =
      err && err.code === 11000
        ? "你已經用同一電郵報名過此組別"
        : "系統錯誤，請稍後再試";
    return renderApply(res.status(500), {
      values,
      errors: { form: message },
      errorList: [],
      cancelled: false
    });
  }
});

app.get("/success", async (req, res) => {
  const rid = String(req.query.rid || "").trim();
  const reg = rid ? await Registration.findById(rid).lean() : null;

  res.render("pages/success", { tournament: TOURNAMENT, reg, divisionLabelOrValue });
});

// Admin: login/logout
app.get("/admin/login", (req, res) => {
  if (!adminConfigured()) {
    return res.status(500).send("Admin credentials not configured");
  }
  if (req.session && req.session.admin === true) return res.redirect("/admin");
  res.render("pages/admin/login", {
    tournament: TOURNAMENT,
    next: String(req.query.next || "/admin"),
    error: ""
  });
});

app.post("/admin/login", (req, res) => {
  if (!adminConfigured()) {
    return res.status(500).send("Admin credentials not configured");
  }
  const u = String(req.body.username || "").trim();
  const p = String(req.body.password || "").trim();
  const nextUrl = String(req.body.next || "/admin");
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    req.session.admin = true;
    return res.redirect(nextUrl);
  }
  return res.status(401).render("pages/admin/login", {
    tournament: TOURNAMENT,
    next: nextUrl,
    error: "帳號或密碼錯誤"
  });
});

app.post("/admin/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  } else {
    res.redirect("/admin/login");
  }
});

// Admin: list registrations
app.get("/admin", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = 25;
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    Registration.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Registration.countDocuments({})
  ]);

  res.render("pages/admin/registrations", {
    tournament: TOURNAMENT,
    items,
    divisionLabelOrValue,
    page,
    pageSize,
    total
  });
});

// Admin: registration detail
app.get("/admin/registration/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const reg = id ? await Registration.findById(id).lean() : null;
  res.render("pages/admin/registration_detail", { tournament: TOURNAMENT, reg, divisionLabelOrValue });
});

// Admin: check email sending status
app.get("/admin/registration/:id/email-check", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const reg = id ? await Registration.findById(id).lean() : null;
  if (!reg) return res.status(404).json({ ok: false, message: "not found" });
  return res.json({
    ok: true,
    emailSentAt: reg.emailSentAt || null,
    emailSendError: reg.emailSendError || ""
  });
});

// Admin: export registrations to XLSX
app.get("/admin/export.xlsx", requireAdmin, async (req, res) => {
  const rows = await Registration.find({}).sort({ createdAt: -1 }).lean();

  const out = rows.map((r) => ({
    提交時間: r.createdAt ? new Date(r.createdAt).toLocaleString("zh-HK", { hour12: false }) : "",
    聯絡人姓名: r.fullName || "",
    電郵: r.email || "",
    電話: r.phone || "",
    推廣碼: r.bocReferralCode || "",
    組別: divisionLabelOrValue(r.division),
    球員1姓名: r.player1?.name || "",
    球員1出生日期: r.player1?.dateOfBirth ? new Date(r.player1.dateOfBirth).toISOString().slice(0, 10) : "",
    球員1性別: r.player1?.gender === "male" ? "男" : (r.player1?.gender === "female" ? "女" : ""),
    球員1DUPR: r.player1?.duprNR ? "NR" : (r.player1?.dupr != null ? Number(r.player1.dupr).toFixed(2) : ""),
    球員2姓名: r.player2?.name || "",
    球員2出生日期: r.player2?.dateOfBirth ? new Date(r.player2.dateOfBirth).toISOString().slice(0, 10) : "",
    球員2性別: r.player2?.gender === "male" ? "男" : (r.player2?.gender === "female" ? "女" : ""),
    球員2DUPR: r.player2?.duprNR ? "NR" : (r.player2?.dupr != null ? Number(r.player2.dupr).toFixed(2) : ""),
    備註: r.notes || "",
    電郵通知狀態: r.emailSentAt ? "已發送" : (r.emailSendError ? "發送失敗" : "待發送"),
    電郵發送時間: r.emailSentAt ? new Date(r.emailSentAt).toLocaleString("zh-HK", { hour12: false }) : "",
    電郵錯誤: r.emailSendError || ""
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(out);
  XLSX.utils.book_append_sheet(wb, ws, "Registrations");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `picklevibes_registrations_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  return res.send(buf);
});

async function main() {
  await mongoose.connect(MONGODB_URI);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
