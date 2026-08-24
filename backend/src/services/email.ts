import type { Env } from '../types';

interface VerificationEmail {
  to: string;
  code: string;
}

export function createEmailVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(value % 1_000_000).padStart(6, '0');
}

export async function sendVerificationEmail(env: Env, input: VerificationEmail): Promise<void> {
  if (env.EMAIL_DELIVERY_MODE !== 'provider') return;
  if (!env.EMAIL_PROVIDER_API_KEY) throw new Error('EMAIL_PROVIDER_API_KEY is not configured.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Tyson Social <noreply@tysonsocial.eu.cc>',
      to: [input.to],
      subject: 'Код подтверждения Tyson Social',
      text: `Tyson Social\n\nВаш код для подтверждения почты: ${input.code}\n\nВведите его в приложении. Код действует 10 минут. Если это были не вы — просто проигнорируйте письмо.`,
      html: `<!doctype html><html lang="ru"><body style="margin:0;padding:0;background:#f2f6f3;color:#19231d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 12px;background:#f2f6f3"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;overflow:hidden;border-radius:24px;background:#ffffff;box-shadow:0 12px 36px rgba(27,61,43,.12)"><tr><td style="padding:28px 34px 22px;background:linear-gradient(135deg,#173d2b,#315f45);text-align:center"><img src="https://tysonsocial.eu.cc/logo.png" width="62" height="62" alt="Tyson" style="display:block;margin:0 auto 13px;border-radius:18px;background:#ffffff" /><div style="color:#e9f56d;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase">Tyson Social</div><div style="margin-top:7px;color:#ffffff;font-size:21px;font-weight:700">Подтверждение почты</div></td></tr><tr><td style="padding:30px 34px 12px"><p style="margin:0 0 10px;font-size:18px;font-weight:700">Ваш код готов</p><p style="margin:0;color:#617066;font-size:14px;line-height:1.55">Введите этот код в Tyson, чтобы подтвердить адрес электронной почты.</p><div style="margin:25px 0 20px;padding:21px 12px;border:1px solid #d4eadc;border-radius:16px;background:#f5fbf7;color:#173d2b;font-size:30px;font-weight:800;letter-spacing:9px;text-align:center">${input.code}</div><p style="margin:0;color:#536158;font-size:13px;line-height:1.55">Код действует <strong>10 минут</strong>. Никому не сообщайте его, даже если вас об этом попросят.</p></td></tr><tr><td style="padding:18px 34px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="height:1px;background:#e5ece7"></td></tr></table><p style="margin:18px 0 0;color:#87938b;font-size:12px;line-height:1.5">Если вы не запрашивали подтверждение, просто проигнорируйте это письмо.</p></td></tr></table><p style="margin:16px 0 0;color:#91a097;font-size:11px;line-height:1.45;text-align:center">© 2026 Tyson Social · Безопасность вашего аккаунта</p></td></tr></table></body></html>`,
    }),
  });

  if (!response.ok) throw new Error(`Resend delivery failed: ${response.status} ${await response.text()}`);
}
