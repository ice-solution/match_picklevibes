const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const Registration = require("./models/Registration");
const {
  GENDER,
  parseDuprInput,
  validateDivisionPlayers
} = require("./lib/divisionRules");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

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

function baseUrl(req) {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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
    bocMemberCode: "",
    division: "",
    notes: "",
    player1Name: "",
    player1Dob: "",
    player1Gender: "",
    player1Dupr: "",
    player2Name: "",
    player2Dob: "",
    player2Gender: "",
    player2Dupr: ""
  };
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
  res.render("pages/apply", {
    tournament: TOURNAMENT,
    registrationDeadline: getRegistrationDeadline(),
    values: defaultApplyValues(),
    errors: {},
    errorList: [],
    cancelled: String(req.query.cancelled || "") === "1"
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
    bocMemberCode: String(req.body.bocMemberCode || "").trim(),
    division: String(req.body.division || "").trim(),
    notes: String(req.body.notes || "").trim(),
    player1Name: String(req.body.player1Name || "").trim(),
    player1Dob: String(req.body.player1Dob || "").trim(),
    player1Gender: String(req.body.player1Gender || "").trim(),
    player1Dupr: String(req.body.player1Dupr || "").trim(),
    player2Name: String(req.body.player2Name || "").trim(),
    player2Dob: String(req.body.player2Dob || "").trim(),
    player2Gender: String(req.body.player2Gender || "").trim(),
    player2Dupr: String(req.body.player2Dupr || "").trim()
  };

  const errors = {};
  if (!values.fullName) errors.fullName = "請填寫聯絡人姓名";
  if (!values.email) errors.email = "請填寫電郵";
  if (values.email && !isValidEmail(values.email)) errors.email = "電郵格式不正確";
  if (!values.phone) errors.phone = "請填寫電話";
  if (!values.division) errors.division = "請選擇組別";

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

  const dup1 = parseDuprInput(values.player1Dupr);
  const dup2 = parseDuprInput(values.player2Dupr);
  if (!dup1.ok) errors.player1Dupr = dup1.error || "DUPR 無效";
  if (!dup2.ok) errors.player2Dupr = dup2.error || "DUPR 無效";

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
        duprRaw: values.player1Dupr
      },
      {
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        duprRaw: values.player2Dupr
      },
      refDate
    );
    if (!v.ok) divisionErrors = v.errors;
  }

  const errorList = [...divisionErrors];
  if (Object.keys(errors).length || errorList.length) {
    return res.status(400).render("pages/apply", {
      tournament: TOURNAMENT,
      registrationDeadline: getRegistrationDeadline(),
      values,
      errors,
      errorList,
      cancelled: false
    });
  }

  const stripe = stripeClient();
  const amountCents = parseInt(process.env.STRIPE_REGISTRATION_AMOUNT_CENTS || "0", 10);
  const currency = (process.env.STRIPE_CURRENCY || "hkd").toLowerCase();

  try {
    const doc = {
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      bocMemberCode: values.bocMemberCode,
      player1: {
        name: values.player1Name,
        dateOfBirth: p1dob,
        gender: values.player1Gender,
        dupr: dup1.value
      },
      player2: {
        name: values.player2Name,
        dateOfBirth: p2dob,
        gender: values.player2Gender,
        dupr: dup2.value
      },
      division: values.division,
      tournamentName: TOURNAMENT.name,
      tournamentDate: TOURNAMENT.date,
      tournamentLocation: TOURNAMENT.location,
      notes: values.notes,
      paymentStatus: stripe ? "pending" : "skipped",
      stripeCheckoutSessionId: ""
    };

    const created = await Registration.create(doc);

    if (!stripe) {
      return res.redirect(`/success?rid=${created._id.toString()}`);
    }

    if (!amountCents || amountCents < 1) {
      await Registration.findByIdAndUpdate(created._id, { paymentStatus: "skipped" });
      return res.redirect(`/success?rid=${created._id.toString()}`);
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: created._id.toString(),
        metadata: { registrationId: created._id.toString() },
        success_url: `${baseUrl(req)}/apply/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl(req)}/apply?cancelled=1`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amountCents,
              product_data: {
                name: `${TOURNAMENT.name} — 報名費`,
                description: values.division.slice(0, 120)
              }
            }
          }
        ]
      });

      await Registration.findByIdAndUpdate(created._id, {
        stripeCheckoutSessionId: session.id
      });

      return res.redirect(303, session.url);
    } catch (stripeErr) {
      await Registration.deleteOne({ _id: created._id });
      throw stripeErr;
    }
  } catch (err) {
    const message =
      err && err.code === 11000
        ? "你已經用同一電郵報名過此組別"
        : "系統錯誤，請稍後再試";
    return res.status(500).render("pages/apply", {
      tournament: TOURNAMENT,
      registrationDeadline: getRegistrationDeadline(),
      values,
      errors: { form: message },
      errorList: [],
      cancelled: false
    });
  }
});

app.get("/apply/complete", async (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  const stripe = stripeClient();
  if (!stripe || !sessionId) {
    return res.redirect("/apply");
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const rid =
      (session.metadata && session.metadata.registrationId) ||
      session.client_reference_id;
    if (!rid || session.payment_status !== "paid") {
      return res.status(400).render("pages/apply", {
        tournament: TOURNAMENT,
        registrationDeadline: getRegistrationDeadline(),
        values: defaultApplyValues(),
        errors: { form: "付款未完成或工作階段無效，請重新提交報名。" },
        errorList: [],
        cancelled: false
      });
    }
    await Registration.findByIdAndUpdate(rid, { paymentStatus: "paid" });
    return res.redirect(`/success?rid=${encodeURIComponent(rid)}`);
  } catch (e) {
    return res.status(500).render("pages/apply", {
      tournament: TOURNAMENT,
      registrationDeadline: getRegistrationDeadline(),
      values: defaultApplyValues(),
      errors: { form: "無法確認付款狀態，請聯絡主辦方。" },
      errorList: [],
      cancelled: false
    });
  }
});

app.get("/success", async (req, res) => {
  const rid = String(req.query.rid || "").trim();
  const reg = rid ? await Registration.findById(rid).lean() : null;

  res.render("pages/success", { tournament: TOURNAMENT, reg });
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
