const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { divisionLabelOrValue, divisionFeeCents } = require("./divisions");

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

function duprOrNR(player) {
  if (player && player.kidNoDuprScore === true) return "沒有 DUPR 積分";
  if (player && player.duprNR === true) return "NR";
  return duprText(player && player.dupr);
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
    `組別：${divisionLabelOrValue(reg.division)}`,
    "",
    `聯絡人：${reg.fullName}`,
    `電郵：${reg.email}`,
    `電話：${reg.phone}`,
    `推廣碼：${reg.bocReferralCode || "—"}`,
    "",
    "球員 1：",
    `- 姓名：${reg.player1?.name || "—"}`,
    `- 出生日期：${reg.player1?.dateOfBirth ? fmtDateISO(reg.player1.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player1?.gender)}`,
    `- DUPR：${duprOrNR(reg.player1)}`,
    "",
    "球員 2：",
    `- 姓名：${reg.player2?.name || "—"}`,
    `- 出生日期：${reg.player2?.dateOfBirth ? fmtDateISO(reg.player2.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player2?.gender)}`,
    `- DUPR：${duprOrNR(reg.player2)}`,
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
            <div><b>組別：</b>${escapeHtml(divisionLabelOrValue(reg.division))}</div>
          </div>
        </div>

        <div style="margin-top:14px; background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
          <div style="font-weight:800;margin-bottom:8px;">聯絡人資料</div>
          <div style="font-size:13px;line-height:1.7;">
            <div><b>姓名：</b>${escapeHtml(reg.fullName)}</div>
            <div><b>電郵：</b>${escapeHtml(reg.email)}</div>
            <div><b>電話：</b>${escapeHtml(reg.phone)}</div>
            <div><b>推廣碼：</b>${escapeHtml(reg.bocReferralCode || "—")}</div>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; grid-template-columns: 1fr; gap:10px;">
          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 1</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player1?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player1?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player1.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player1?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprOrNR(reg.player1))}</div>
            </div>
          </div>

          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 2</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player2?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player2?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player2.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player2?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprOrNR(reg.player2))}</div>
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

function emailBannerAttachments() {
  const bannerPath = path.join(__dirname, "..", "public", "images", "email_banner.png");
  try {
    if (fs.existsSync(bannerPath)) {
      return [{ filename: "email_banner.png", path: bannerPath, cid: "pv_email_banner" }];
    }
  } catch (_e) {
    /* ignore */
  }
  return [];
}

function formatHkdFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return `HK$${(n / 100).toFixed(2)}`;
}

function buildPaymentRequestEmail({ tournament, reg, checkoutUrl, amountCents, publicBaseUrl }) {
  const cents =
    amountCents != null && Number.isFinite(Number(amountCents))
      ? Number(amountCents)
      : divisionFeeCents(reg.division);
  const amountText = formatHkdFromCents(cents);
  const bannerAttachments = emailBannerAttachments();
  const fallbackBannerUrl = `${String(publicBaseUrl || "")
    .trim()
    .replace(/\/$/, "")}/images/email_banner.png`;
  const bannerSrcAttr =
    bannerAttachments.length > 0 ? "cid:pv_email_banner" : escapeHtml(fallbackBannerUrl);

  const subject = `【付款通知】${tournament.name}｜請於限期內完成報名費付款（${amountText}）`;

  const summaryLines = [
    `你好 ${reg.fullName || ""}，`,
    "",
    "感謝你參加本次賽事報名。請仔細核對以下資料是否正確，並請於電郵內連結前往 Stripe 安全付款頁完成報名費付款。",
    "",
    `比賽：${tournament.name}`,
    `日期：${tournament.date}`,
    `地點：${tournament.location}`,
    "",
    `組別：${divisionLabelOrValue(reg.division)}`,
    `報名費：${amountText}`,
    "",
    `聯絡人：${reg.fullName}`,
    `電郵：${reg.email}`,
    `電話：${reg.phone}`,
    `推廣碼：${reg.bocReferralCode || "—"}`,
    "",
    "球員 1：",
    `- 姓名：${reg.player1?.name || "—"}`,
    `- 出生日期：${reg.player1?.dateOfBirth ? fmtDateISO(reg.player1.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player1?.gender)}`,
    `- DUPR：${duprOrNR(reg.player1)}`,
    "",
    "球員 2：",
    `- 姓名：${reg.player2?.name || "—"}`,
    `- 出生日期：${reg.player2?.dateOfBirth ? fmtDateISO(reg.player2.dateOfBirth) : "—"}`,
    `- 性別：${genderText(reg.player2?.gender)}`,
    `- DUPR：${duprOrNR(reg.player2)}`,
    "",
    reg.notes ? `備註：\n${reg.notes}` : null,
    "",
    `付款連結（Stripe）：\n${checkoutUrl}`,
    "",
    "付款完成後，系統會用電郵／網站流程確認（請保留 Stripe 收據）。如有問題請聯絡主辦方。"
  ].filter(Boolean);

  const text = summaryLines.join("\n");

  const html = `
  <div style="font-family: Arial, 'Noto Sans TC', sans-serif; background:#f6f8fc; padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.06);">
      <div style="line-height:0;">
        <img src="${bannerSrcAttr}" alt="" width="640" style="width:100%;max-width:640px;height:auto;display:block;border:0;outline:none;" />
      </div>

      <div style="padding:18px 20px; color:#0B1220;">
        <div style="font-size:18px;font-weight:900;">感謝你參加</div>
        <div style="margin-top:6px;font-size:14px;line-height:1.7;color:rgba(0,0,0,.72);">
          請核對以下報名資料，並點擊下方按鈕前往 <b>Stripe</b> 付款頁完成報名費付款。
        </div>

        <div style="margin-top:14px;text-align:center;">
          <a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#635BFF;color:#fff;text-decoration:none;font-weight:900;padding:12px 18px;border-radius:12px;">
            前往 Stripe 付款（${escapeHtml(amountText)}）
          </a>
          <div style="margin-top:10px;font-size:12px;line-height:1.7;color:rgba(0,0,0,.55);">
            若按鈕無法開啟，請複製此連結到瀏覽器：<br/>
            <span style="word-break:break-all;color:rgba(0,0,0,.72);">${escapeHtml(checkoutUrl)}</span>
          </div>
        </div>

        <div style="margin-top:14px; background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
          <div style="font-weight:800;margin-bottom:8px;">賽事資訊</div>
          <div style="font-size:13px;line-height:1.7;">
            <div><b>日期：</b>${escapeHtml(tournament.date)}</div>
            <div><b>地點：</b>${escapeHtml(tournament.location)}</div>
            <div><b>組別：</b>${escapeHtml(divisionLabelOrValue(reg.division))}</div>
            <div><b>報名費：</b>${escapeHtml(amountText)}</div>
          </div>
        </div>

        <div style="margin-top:14px; background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
          <div style="font-weight:800;margin-bottom:8px;">聯絡人資料</div>
          <div style="font-size:13px;line-height:1.7;">
            <div><b>姓名：</b>${escapeHtml(reg.fullName)}</div>
            <div><b>電郵：</b>${escapeHtml(reg.email)}</div>
            <div><b>電話：</b>${escapeHtml(reg.phone)}</div>
            <div><b>推廣碼：</b>${escapeHtml(reg.bocReferralCode || "—")}</div>
          </div>
        </div>

        <div style="margin-top:14px; display:grid; grid-template-columns: 1fr; gap:10px;">
          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 1</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player1?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player1?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player1.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player1?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprOrNR(reg.player1))}</div>
            </div>
          </div>

          <div style="background:#f6f8fc;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">球員 2</div>
            <div style="font-size:13px;line-height:1.7;">
              <div><b>姓名：</b>${escapeHtml(reg.player2?.name || "—")}</div>
              <div><b>出生日期：</b>${reg.player2?.dateOfBirth ? escapeHtml(fmtDateISO(reg.player2.dateOfBirth)) : "—"}</div>
              <div><b>性別：</b>${escapeHtml(genderText(reg.player2?.gender))}</div>
              <div><b>DUPR：</b>${escapeHtml(duprOrNR(reg.player2))}</div>
            </div>
          </div>
        </div>

        ${reg.notes ? `
          <div style="margin-top:14px; background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 14px;">
            <div style="font-weight:800;margin-bottom:8px;">備註</div>
            <div style="white-space:pre-wrap; font-size:13px;line-height:1.7; color:rgba(0,0,0,.75);">${escapeHtml(reg.notes)}</div>
          </div>
        ` : ""}

        <div style="margin-top:14px; padding:14px 14px; border-radius:12px; background:rgba(99,91,255,.08); border:1px solid rgba(99,91,255,.18);">
          <div style="font-weight:800;">付款提示</div>
          <div style="margin-top:6px; font-size:13px; line-height:1.7; color:rgba(0,0,0,.75);">
            請使用此電郵提供的 Stripe 連結完成付款；連結由 Stripe 托管，安全可靠。
          </div>
        </div>
      </div>

      <div style="padding:14px 20px; font-size:12px; color:rgba(0,0,0,.55); border-top:1px solid rgba(0,0,0,.06);">
        此為系統自動發送電郵，請勿直接回覆。
      </div>
    </div>
  </div>
  `.trim();

  return { subject, text, html, attachments: bannerAttachments };
}

async function sendPaymentRequestEmail({ tournament, reg, checkoutUrl, amountCents, publicBaseUrl }) {
  const t = transporter();
  if (!t) {
    return { ok: false, error: "Email transporter not configured" };
  }
  const fromName = process.env.EMAIL_FROM_NAME || "PickleVibes";
  const from = process.env.EMAIL_FROM || `${fromName} <${process.env.EMAIL_USER}>`;
  const { subject, text, html, attachments } = buildPaymentRequestEmail({
    tournament,
    reg,
    checkoutUrl,
    amountCents,
    publicBaseUrl
  });
  await t.sendMail({
    from,
    to: reg.email,
    subject,
    text,
    html,
    attachments
  });
  return { ok: true };
}

module.exports = {
  duprOrNR,
  sendRegistrationEmail,
  buildRegistrationEmail,
  sendPaymentRequestEmail,
  buildPaymentRequestEmail
};

