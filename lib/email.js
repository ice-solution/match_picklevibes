const nodemailer = require("nodemailer");

function getMailerConfig() {
  return {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: String(process.env.EMAIL_SECURE || "").trim() === "true", // Gmail STARTTLS 通常為 false
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  };
}

function transporter() {
  const cfg = getMailerConfig();
  if (!cfg.host || !cfg.port || !cfg.auth.user || !cfg.auth.pass) return null;
  return nodemailer.createTransport(cfg);
}

function fmtDateISO(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch (e) {
    return "—";
  }
}

function genderText(g) {
  if (g === "male") return "男";
  if (g === "female") return "女";
  return "—";
}

function duprText(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(2);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildRegistrationEmail({ tournament, reg }) {
  const subject = `【登記完成】${tournament.name}｜稍後通知抽籤結果及付款連結`;

  const summaryLines = [
    `比賽：${tournament.name}`,
    `日期：${tournament.date}`,
    `地點：${tournament.location}`,
    "",
    `組別：${reg.division}`,
    "",
    `聯絡人：${reg.fullName}`,
    `電郵：${reg.email}`,
    `電話：${reg.phone}`,
    `BOC 推薦碼：${reg.bocReferralCode || "—"}`,
    `推薦人電話：${reg.referrerPhone || "—"}`,
    "",
    "球員 1：",
    `- 姓名：${reg.player1?.name || "—"}`,
    `- 出生日期：${reg.player1?.dateOfBirth ? fmtDateISO(reg.player1.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player1?.gender)}`,
    `- DUPR：${duprText(reg.player1?.dupr)}`,
    "",
    "球員 2：",
    `- 姓名：${reg.player2?.name || "—"}`,
    `- 出生日期：${reg.player2?.dateOfBirth ? fmtDateISO(reg.player2.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player2?.gender)}`,
    `- DUPR：${duprText(reg.player2?.dupr)}`,
    "",
    reg.notes ? `備註：\n${reg.notes}` : null,
    "",
    "我們會於稍後通知抽籤結果及付款連結，請留意電郵。"
  ].filter(Boolean);

  const text = summaryLines.join("\n");

  const html = `
  <div style="font-family: Arial, 'Noto Sans TC', sans-serif; background:#f6f8fc; padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.06);">
      <div style="background:linear-gradient(135deg,#09B7BC,#F7C300,#E6027E);padding:18px 20px;color:#fff;">
        <div style="font-size:14px;font-weight:700;letter-spacing:.5px;">登記完成</div>
        <div style="font-size:20px;font-weight:800;margin-top:6px;">${escapeHtml(tournament.name)}</div>
        <div style="opacity:.95;margin-top:6px;font-size:13px;">稍後通知抽籤結果及付款連結</div>
      </div>

      <div style="padding:18px 20px; color:#0B1220;">
        <p style="margin:0 0 12px 0; color:rgba(0,0,0,.7);">
          你好，以下為你的登記資料摘要。請保留此電郵作紀錄。
        </p>

        <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
          <div style="font-weight:800;margin-bottom:8px;">賽事資訊</div>
          <div style="font-size:13px;line-height:1.7;">
            <div><b>日期：</b>${escapeHtml(tournament.date)}</div>
            <div><b>地點：</b>${escapeHtml(tournament.location)}</div>
            <div><b>組別：</b>${escapeHtml(reg.division)}</div>
          </div>
        </div>

        <div style="margin-top:14px; background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
          <div style="font-weight:800;margin-bottom:8px;">聯絡人資料</div>
          <div style="font-size:13px;line-height:1.7;">
            <div><b>姓名：</b>${escapeHtml(reg.fullName)}</div>
            <div><b>電郵：</b>${escapeHtml(reg.email)}</div>
            <div><b>電話：</b>${escapeHtml(reg.phone)}</div>
            <div><b>BOC 推薦碼：</b>${escapeHtml(reg.bocReferralCode || "—")}</div>
            <div><b>推薦人電話：</b>${escapeHtml(reg.referrerPhone || "—")}</div>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; grid-template-columns: 1fr; gap:10px;">
          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 1</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player1?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player1?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player1.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player1?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprText(reg.player1?.dupr))}</div>
            </div>
          </div>

          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 2</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player2?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player2?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player2.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player2?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprText(reg.player2?.dupr))}</div>
            </div>
          </div>
        </div>

        ${reg.notes ? `
          <div style="margin-top:14px; background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">備註</div>
            <div style="white-space:pre-wrap; font-size:13px;line-height:1.7; color:rgba(0,0,0,.75);">${escapeHtml(reg.notes)}</div>
          </div>
        ` : ""}

        <div style="margin-top:14px; padding:14px 14px; border-radius:12px; background:rgba(9,183,188,.10); border:1px solid rgba(9,183,188,.20);">
          <div style="font-weight:800;">下一步</div>
          <div style="margin-top:6px; font-size:13px; line-height:1.7; color:rgba(0,0,0,.75);">
            我們會於稍後通知抽籤結果及付款連結，請留意電郵。
          </div>
        </div>
      </div>

      <div style="padding:14px 20px; font-size:12px; color:rgba(0,0,0,.55); border-top:1px solid rgba(0,0,0,.06);">
        此為系統自動發送電郵，請勿直接回覆。
      </div>
    </div>
  </div>
  `.trim();

  return { subject, text, html };
}

async function sendRegistrationEmail({ tournament, reg }) {
  const t = transporter();
  if (!t) {
    return { ok: false, error: "Email transporter not configured" };
  }
  const fromName = process.env.EMAIL_FROM_NAME || "PickleVibes";
  const from = process.env.EMAIL_FROM || `${fromName} <${process.env.EMAIL_USER}>`;
  const { subject, text, html } = buildRegistrationEmail({ tournament, reg });
  await t.sendMail({
    from,
    to: reg.email,
    subject,
    text,
    html
  });
  return { ok: true };
}

module.exports = { sendRegistrationEmail, buildRegistrationEmail };

