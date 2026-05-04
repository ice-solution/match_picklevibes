const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
require("dotenv").config();
const XLSX = require("xlsx");

const Registration = require("./models/Registration");
const PaymentTransaction = require("./models/PaymentTransaction");
const { sendRegistrationEmail, sendPaymentRequestEmail, duprOrNR } = require("./lib/email");
const { divisionLabelOrValue, divisionFeeCents } = require("./lib/divisions");
const {
  GENDER,
  parseDuprInput,
  allowNRForDivision,
  validateDivisionPlayers,
  isKidsDivision
} = require("./lib/divisionRules");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret";
const ADMIN_USER = String(process.env.ADMIN_USER || "").trim();
const ADMIN_PASS = String(process.env.ADMIN_PASS || "").trim();
/** 若報名時填寫推廣碼，須與此完全一致；留空可不填（可用 .env 的 BOC_EXPECTED_REFERRAL_CODE 覆寫） */
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

function stripeConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
}

function baseUrl(req) {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

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

// Stripe Webhook：必須使用 raw body 驗證簽名（請勿套用 json/urlencoded）
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = stripeClient();
  const secret = stripeWebhookSecret();
  if (!stripe || !secret) return res.status(500).send("stripe webhook not configured");

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const sid = session.id;
        const paid =
          session.payment_status === "paid" || session.payment_status === "no_payment_required";
        const rid = session.metadata && session.metadata.registrationId ? String(session.metadata.registrationId) : "";

        const txn = await PaymentTransaction.findOne({ stripeCheckoutSessionId: sid });
        if (txn && paid) {
          txn.status = "paid";
          txn.paidAt = new Date();
          txn.stripePaymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent && session.payment_intent.id
                ? session.payment_intent.id
                : txn.stripePaymentIntentId;
          txn.lastWebhookEventId = event.id;
          await txn.save();

          if (rid) {
            await Registration.findByIdAndUpdate(rid, {
              paymentStatus: "paid",
              paidAt: txn.paidAt,
              latestStripeCheckoutSessionId: sid,
              latestPaymentAmountCents: txn.amountCents
            });
          }
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        await PaymentTransaction.findOneAndUpdate(
          { stripeCheckoutSessionId: session.id },
          { $set: { status: "expired", lastWebhookEventId: event.id } }
        );
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("stripe webhook handler failed:", e);
    return res.status(500).send("handler error");
  }

  return res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`);
}

function adminConfigured() {
  return Boolean(ADMIN_USER && ADMIN_PASS);
}

async function appPublicBaseUrl(req) {
  const env = String(process.env.APP_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (env) return env;
  return baseUrl(req);
}

/** 建立 Stripe Checkout Session 並寫入交易／報名紀錄（不寄電郵） */
async function createCheckoutSessionForRegistration(regLean, req) {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe 未設定（缺少 STRIPE_SECRET_KEY）");
  const pub = await appPublicBaseUrl(req);
  const currency = String(process.env.STRIPE_CURRENCY || "hkd")
    .trim()
    .toLowerCase();
  const amount = divisionFeeCents(regLean.division);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: regLean.email,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: `${TOURNAMENT.name} · 報名費`,
            description: divisionLabelOrValue(regLean.division)
          }
        },
        quantity: 1
      }
    ],
    success_url: `${pub}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${pub}/payment/cancel?rid=${regLean._id}`,
    metadata: {
      registrationId: String(regLean._id)
    }
  });

  await PaymentTransaction.create({
    registration: regLean._id,
    stripeCheckoutSessionId: session.id,
    amountCents: amount,
    currency,
    status: "pending",
    checkoutUrl: session.url || ""
  });

  await Registration.findByIdAndUpdate(regLean._id, {
    paymentStatus: "pending",
    latestStripeCheckoutSessionId: session.id,
    latestPaymentAmountCents: amount
  });

  return {
    session,
    checkoutUrl: session.url || "",
    amountCents: amount,
    currency,
    pub
  };
}

async function sendCheckoutPaymentEmailToRegistrant(regLean, stripeCheckoutSessionId, checkoutUrl, amountCents, pub) {
  try {
    await sendPaymentRequestEmail({
      tournament: TOURNAMENT,
      reg: regLean,
      checkoutUrl,
      amountCents,
      publicBaseUrl: pub
    });
    await PaymentTransaction.findOneAndUpdate(
      { stripeCheckoutSessionId },
      { paymentEmailSentAt: new Date(), paymentEmailSendError: "" }
    );
  } catch (emailErr) {
    await PaymentTransaction.findOneAndUpdate(
      { stripeCheckoutSessionId },
      {
        paymentEmailSendError: String(
          emailErr && emailErr.message ? emailErr.message : emailErr || "email send failed"
        )
      }
    );
    throw emailErr;
  }
}

async function createCheckoutSessionAndSendPaymentEmail(regLean, req) {
  const { session, checkoutUrl, amountCents, pub } = await createCheckoutSessionForRegistration(regLean, req);
  await sendCheckoutPaymentEmailToRegistrant(regLean, session.id, checkoutUrl, amountCents, pub);
  return session;
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
    player1KidNoDupr: "",
    player1Dupr: "",
    player2Name: "",
    player2Dob: "",
    player2Gender: "",
    player2DuprNR: "",
    player2KidNoDupr: "",
    player2Dupr: ""
  };
}

function renderApply(res, locals) {
  return res.render("pages/apply", {
    tournament: TOURNAMENT,
    registrationDeadline: getRegistrationDeadline(),
    ...locals
  });
}

async function renderApplyWithStats(res, locals) {
  return renderApply(res, locals);
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
  renderApplyWithStats(res, {
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
    player1KidNoDupr: String(req.body.player1KidNoDupr || "").trim(),
    player1Dupr: String(req.body.player1Dupr || "").trim(),
    player2Name: String(req.body.player2Name || "").trim(),
    player2Dob: String(req.body.player2Dob || "").trim(),
    player2Gender: String(req.body.player2Gender || "").trim(),
    player2DuprNR: String(req.body.player2DuprNR || "").trim(),
    player2KidNoDupr: String(req.body.player2KidNoDupr || "").trim(),
    player2Dupr: String(req.body.player2Dupr || "").trim()
  };

  const errors = {};
  if (!values.fullName) errors.fullName = "請填寫聯絡人姓名";
  if (!values.email) errors.email = "請填寫電郵";
  if (values.email && !isValidEmail(values.email)) errors.email = "電郵格式不正確";
  if (!values.phone) errors.phone = "請填寫電話";
  if (
    values.bocReferralCode &&
    values.bocReferralCode !== BOC_EXPECTED_REFERRAL_CODE
  ) {
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

  const kidDiv = isKidsDivision(values.division);
  const p1nr = values.player1DuprNR === "on";
  const p2nr = values.player2DuprNR === "on";
  const p1kid = values.player1KidNoDupr === "on";
  const p2kid = values.player2KidNoDupr === "on";

  if (kidDiv && (p1nr || p2nr)) {
    errors.player1Dupr = "小朋友組不適用 NR；如沒有 DUPR 請勾選「沒有 DUPR 積分」";
    errors.player2Dupr = "小朋友組不適用 NR；如沒有 DUPR 請勾選「沒有 DUPR 積分」";
  }

  const nrAllowed = allowNRForDivision(values.division);
  if (!kidDiv && (p1nr || p2nr) && !nrAllowed) {
    errors.player1Dupr = "此組別不接受 NR，請填寫 DUPR";
    errors.player2Dupr = "此組別不接受 NR，請填寫 DUPR";
  }

  let dup1;
  let dup2;
  if (kidDiv) {
    dup1 = p1kid ? { ok: true, value: null } : parseDuprInput(values.player1Dupr);
    dup2 = p2kid ? { ok: true, value: null } : parseDuprInput(values.player2Dupr);
    if (!p1kid && !dup1.ok) errors.player1Dupr = dup1.error || "DUPR 無效";
    if (!p2kid && !dup2.ok) errors.player2Dupr = dup2.error || "DUPR 無效";
  } else {
    dup1 = p1nr ? { ok: true, value: null } : parseDuprInput(values.player1Dupr);
    dup2 = p2nr ? { ok: true, value: null } : parseDuprInput(values.player2Dupr);
    if (!p1nr && !dup1.ok) errors.player1Dupr = dup1.error || "DUPR 無效";
    if (!p2nr && !dup2.ok) errors.player2Dupr = dup2.error || "DUPR 無效";
  }

  if (!kidDiv && (p1kid || p2kid)) {
    errors.player1Dupr = "「沒有 DUPR 積分」只適用於小朋友組別";
    errors.player2Dupr = "「沒有 DUPR 積分」只適用於小朋友組別";
  }

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
        duprNR: kidDiv ? false : p1nr,
        duprKidSkip: kidDiv && p1kid,
        duprRaw: values.player1Dupr
      },
      {
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        duprNR: kidDiv ? false : p2nr,
        duprKidSkip: kidDiv && p2kid,
        duprRaw: values.player2Dupr
      },
      refDate
    );
    if (!v.ok) divisionErrors = v.errors;
  }

  const errorList = [...divisionErrors];
  if (Object.keys(errors).length || errorList.length) {
    return renderApplyWithStats(res.status(400), {
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
        duprNR: kidDiv ? false : p1nr,
        kidNoDuprScore: kidDiv && p1kid,
        dupr: dup1.value
      },
      player2: {
        name: values.player2Name,
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        duprNR: kidDiv ? false : p2nr,
        kidNoDuprScore: kidDiv && p2kid,
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
    return renderApplyWithStats(res.status(500), {
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

  res.render("pages/success", { tournament: TOURNAMENT, reg, divisionLabelOrValue, duprOrNR });
});

app.get("/payment/success", (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  res.render("pages/payment_success", { tournament: TOURNAMENT, sessionId });
});

app.get("/payment/cancel", (req, res) => {
  const rid = String(req.query.rid || "").trim();
  res.render("pages/payment_cancel", { tournament: TOURNAMENT, rid });
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

  const paymentEmailBatchFlash = req.session.paymentEmailBatchFlash || null;
  if (req.session.paymentEmailBatchFlash) delete req.session.paymentEmailBatchFlash;

  res.render("pages/admin/registrations", {
    tournament: TOURNAMENT,
    items,
    divisionLabelOrValue,
    duprOrNR,
    stripePaymentOk: stripeConfigured(),
    paymentEmailBatchFlash,
    page,
    pageSize,
    total
  });
});

// Admin: registration detail
app.get("/admin/registration/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const reg = id ? await Registration.findById(id).lean() : null;
  let paymentFlash = "";
  const p = String(req.query.payment || "").trim();
  if (p === "sent") paymentFlash = "已發送付款電郵（內附 Stripe 付款連結）。";
  if (p === "fail") paymentFlash = `發送失敗：${String(req.query.msg || "").trim()}`;
  res.render("pages/admin/registration_detail", {
    tournament: TOURNAMENT,
    reg,
    divisionLabelOrValue,
    duprOrNR,
    divisionFeeCents,
    stripePaymentOk: stripeConfigured(),
    paymentFlash
  });
});

app.post("/admin/registration/:id/send-payment-email", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const reg = id ? await Registration.findById(id).lean() : null;
  if (!reg) return res.redirect("/admin");
  try {
    await createCheckoutSessionAndSendPaymentEmail(reg, req);
    return res.redirect(`/admin/registration/${encodeURIComponent(id)}?payment=sent`);
  } catch (e) {
    const msg = encodeURIComponent(String(e && e.message ? e.message : e || "error"));
    return res.redirect(`/admin/registration/${encodeURIComponent(id)}?payment=fail&msg=${msg}`);
  }
});

/** 僅建立 Stripe Checkout（不寄電郵），供後台測試連結；回傳 JSON */
app.post("/admin/registration/:id/checkout-preview", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const reg = id ? await Registration.findById(id).lean() : null;
  if (!reg) return res.status(404).json({ ok: false, message: "找不到報名" });
  if (reg.paymentStatus === "paid") {
    return res.status(400).json({ ok: false, message: "此報名已標記為已付款" });
  }
  if (!stripeConfigured()) {
    return res.status(400).json({ ok: false, message: "Stripe 未設定（缺少 STRIPE_SECRET_KEY）" });
  }
  try {
    const { session, checkoutUrl, amountCents, pub } = await createCheckoutSessionForRegistration(reg, req);
    return res.json({
      ok: true,
      checkoutUrl,
      sessionId: session.id,
      amountCents,
      publicBaseUrl: pub,
      note: "已建立 Session 並寫入資料庫，但未寄出電郵。請使用下方連結以測試卡付款；每次按鈕會產生一筆新的待付款 Session。"
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e && e.message ? e.message : e || "error")
    });
  }
});

/** 列表頁勾選多筆後，逐筆寄送付款電郵（各建立一筆 Checkout） */
app.post("/admin/registrations/send-payment-emails", requireAdmin, async (req, res) => {
  let raw = req.body.registrationIds;
  if (raw == null) raw = [];
  if (!Array.isArray(raw)) raw = [raw];
  const ids = raw.map((x) => String(x || "").trim()).filter(Boolean);

  if (!ids.length) {
    req.session.paymentEmailBatchFlash = { lines: ["請至少勾選一筆報名。"] };
    return res.redirect("/admin");
  }

  if (!stripeConfigured()) {
    req.session.paymentEmailBatchFlash = { lines: ["Stripe 未設定：請設定 STRIPE_SECRET_KEY"] };
    return res.redirect("/admin");
  }

  const lines = [];
  for (const id of ids) {
    const reg = await Registration.findById(id).lean();
    if (!reg) {
      lines.push(`✗（${id}）：找不到報名`);
      continue;
    }
    const label = `${reg.fullName || ""}｜${reg.email || ""}`;
    if (reg.paymentStatus === "paid") {
      lines.push(`○ ${label}：已付款，略過`);
      continue;
    }
    try {
      await createCheckoutSessionAndSendPaymentEmail(reg, req);
      lines.push(`✓ ${label}｜${divisionLabelOrValue(reg.division)}`);
    } catch (e) {
      lines.push(`✗ ${label}：${String((e && e.message) || e || "error")}`);
    }
  }

  req.session.paymentEmailBatchFlash = { lines };
  return res.redirect("/admin");
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

// Admin: batch payment emails (Stripe Checkout links)
app.get("/admin/payment-batch", requireAdmin, async (req, res) => {
  const unpaidCount = await Registration.countDocuments({ paymentStatus: { $ne: "paid" } });
  const stripeOk = stripeConfigured();
  const pub = await appPublicBaseUrl(req);
  const webhookUrl = `${pub}/stripe/webhook`;
  res.render("pages/admin/payment_batch", {
    tournament: TOURNAMENT,
    stripeOk,
    unpaidCount,
    webhookUrl,
    result: null
  });
});

app.post("/admin/payment-batch/send", requireAdmin, async (req, res) => {
  const sendPaidToo = String(req.body.sendPaidToo || "").trim() === "1";
  const stripeOk = stripeConfigured();
  const pub = await appPublicBaseUrl(req);
  const webhookUrl = `${pub}/stripe/webhook`;
  const result = { ok: 0, fail: 0, lines: [] };

  if (!stripeOk) {
    result.lines.push("Stripe 未設定：請設定 STRIPE_SECRET_KEY");
    const unpaidCount = await Registration.countDocuments({ paymentStatus: { $ne: "paid" } });
    return res.render("pages/admin/payment_batch", {
      tournament: TOURNAMENT,
      stripeOk,
      unpaidCount,
      webhookUrl,
      result
    });
  }

  const query = sendPaidToo ? {} : { paymentStatus: { $ne: "paid" } };
  const regs = await Registration.find(query).sort({ createdAt: 1 }).lean();

  for (const r of regs) {
    try {
      await createCheckoutSessionAndSendPaymentEmail(r, req);
      result.ok += 1;
      result.lines.push(`✓ ${r.email}｜${divisionLabelOrValue(r.division)}`);
    } catch (e) {
      result.fail += 1;
      result.lines.push(`✗ ${r.email}｜${String(e && e.message ? e.message : e)}`);
    }
  }

  const unpaidCount = await Registration.countDocuments({ paymentStatus: { $ne: "paid" } });
  return res.render("pages/admin/payment_batch", {
    tournament: TOURNAMENT,
    stripeOk,
    unpaidCount,
    webhookUrl,
    result
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
    付款狀態:
      r.paymentStatus === "paid" ? "已付款" : r.paymentStatus === "pending" ? "待付款" : "未付款",
    付款時間: r.paidAt ? new Date(r.paidAt).toLocaleString("zh-HK", { hour12: false }) : "",
    球員1姓名: r.player1?.name || "",
    球員1出生日期: r.player1?.dateOfBirth ? new Date(r.player1.dateOfBirth).toISOString().slice(0, 10) : "",
    球員1性別: r.player1?.gender === "male" ? "男" : (r.player1?.gender === "female" ? "女" : ""),
    球員1DUPR: duprOrNR(r.player1),
    球員2姓名: r.player2?.name || "",
    球員2出生日期: r.player2?.dateOfBirth ? new Date(r.player2.dateOfBirth).toISOString().slice(0, 10) : "",
    球員2性別: r.player2?.gender === "male" ? "男" : (r.player2?.gender === "female" ? "女" : ""),
    球員2DUPR: duprOrNR(r.player2),
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
