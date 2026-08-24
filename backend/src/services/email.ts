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
      text: `Ваш код для подтверждения почты в Tyson Social: ${input.code}\n\nВведите его в приложении. Код действует 10 минут. Если это были не вы — просто проигнорируйте письмо.`,
      html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#17191d"><h1 style="margin:0 0 18px">Tyson Social</h1><p>Ваш код для подтверждения почты:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0">${input.code}</p><p>Введите его в приложении. Код действует 10 минут.</p><p style="color:#69707a">Если это были не вы — просто проигнорируйте письмо.</p></main>`,
    }),
  });

  if (!response.ok) throw new Error(`Resend delivery failed: ${response.status} ${await response.text()}`);
}
