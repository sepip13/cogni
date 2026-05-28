import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM ?? "Cogni <onboarding@resend.dev>";

export async function sendVerificationCode(email: string, code: string): Promise<boolean> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${code} is your Cogni verification code`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Verify your email</h1>
        <p style="color: #666; font-size: 15px; margin-bottom: 32px;">Enter this code to finish signing up for Cogni:</p>
        <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 0.15em; color: #18181b;">${code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 10 minutes. If you didn't sign up for Cogni, ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    return false;
  }
  return true;
}
