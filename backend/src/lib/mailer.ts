import { Resend } from "resend";

export type SendResult = { success: true } | { success: false; error: string };

export function isMailerLive() {
  return Boolean(process.env.RESEND_API_KEY);
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (!resend) {
    // Mode simulé : aucun appel réseau tant que RESEND_API_KEY n'est pas configurée.
    console.log(`[mailer:simulé] à ${to} — sujet: ${subject}`);
    return { success: true };
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    return { success: false, error: "MAIL_FROM non configuré côté serveur." };
  }

  try {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { success: false, error: result.error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
