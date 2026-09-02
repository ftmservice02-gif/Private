// Sends the "you've been invited to a project" email. Uses Gmail SMTP with
// an App Password (SMTP_USER/SMTP_PASS in .env) — if those aren't set, the
// invite itself still succeeds (project_members insert), this just logs a
// warning and skips the email instead of failing the whole request.
const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendProjectInviteEmail({ to, recipientName, projectTitle, projectId, inviterName }) {
  const t = getTransporter();
  if (!t) {
    console.warn("[mailer] SMTP_USER/SMTP_PASS not configured — skipping invite email to", to);
    return;
  }
  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:8743").replace(/\/$/, "");
  const link = baseUrl + "/board.html?id=" + encodeURIComponent(projectId);
  const name = escapeHtml(recipientName || "");
  const title = escapeHtml(projectTitle || "โครงการ");
  const inviter = escapeHtml(inviterName || "ทีมงาน");

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2329;">
      <h2 style="color:#2f6fed; margin-bottom: 4px;">คุณได้รับเชิญเข้าร่วมโครงการ</h2>
      <p>${name ? "สวัสดีคุณ " + name + "," : "สวัสดีครับ/ค่ะ,"}</p>
      <p><strong>${inviter}</strong> ได้เพิ่มคุณเข้าร่วมโครงการ <strong>"${title}"</strong> บน IT Project Board แล้ว</p>
      <p style="margin: 20px 0;">
        <a href="${link}" style="display:inline-block;background:#2f6fed;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-weight:600;">
          เปิดโครงการ
        </a>
      </p>
      <p style="color:#8b909a;font-size:12px;">หากปุ่มด้านบนใช้งานไม่ได้ ให้เปิดลิงก์นี้แทน:<br>${link}</p>
    </div>
  `;

  try {
    await t.sendMail({
      from: `"IT Project Board" <${process.env.SMTP_USER}>`,
      to,
      subject: `คุณได้รับเชิญเข้าร่วมโครงการ "${projectTitle || ""}"`,
      html,
    });
  } catch (err) {
    console.error("[mailer] Failed to send invite email to", to, "-", err.message);
  }
}

module.exports = { sendProjectInviteEmail };
