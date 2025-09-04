import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { prisma } from "./prisma.server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const sessionSecret = process.env.SESSION_SECRET || "dev-secret";
if (!sessionSecret) throw new Error("SESSION_SECRET is required");

const storage = createCookieSessionStorage({
  cookie: {
    name: "__axis_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return storage.getSession(cookie);
}

export async function getUserId(request: Request) {
  const session = await getSession(request);
  const uid = session.get("userId");
  return typeof uid === "number" ? uid : null;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (!userId)
    throw redirect(
      `/login?redirectTo=${encodeURIComponent(new URL(request.url).pathname)}`
    );
  return userId;
}

export async function getUser(request: Request) {
  const id = await getUserId(request);
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export async function register(email: string, password: string, name?: string) {
  const hash = await bcrypt.hash(password, 12);
  return prisma.user.create({ data: { email, passwordHash: hash, name } });
}

export async function createUserSession(userId: number, redirectTo: string) {
  const session = await storage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo || "/", {
    headers: {
      "Set-Cookie": await storage.commitSession(session, {
        maxAge: 60 * 60 * 24 * 30,
      }),
    },
  });
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/login", {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}

// --- Forgot password via OTP ---
export function generateOTP(length = 6) {
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < length; i++)
    out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

export async function startPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Do not reveal if user exists
  const otp = generateOTP(6);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 min
  await prisma.passwordReset.create({
    data: { userId: user.id, otp, token, expiresAt },
  });
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const link = `${origin.replace(/\/$/, "")}/reset/${token}`;
  await sendEmail(email, {
    subject: "Your password reset code",
    text: `Use this link to reset your password: ${link}\n\nOr go to /reset/${token} and enter this code: ${otp}`,
  });
}

export async function completePasswordReset(
  token: string,
  otp: string,
  newPassword: string
) {
  const pr = await prisma.passwordReset.findUnique({ where: { token } });
  if (!pr || pr.usedAt || pr.expiresAt < new Date()) return false;
  if (pr.otp !== otp) return false;
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: pr.userId },
      data: { passwordHash: hash },
    }),
    prisma.passwordReset.update({
      where: { id: pr.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return true;
}

// Basic email sender; replace with real provider later
export async function sendEmail(
  to: string,
  { subject, text }: { subject: string; text: string }
) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[email] to=${to} subject="${subject}" text="${text}"`);
    return;
  }
  // TODO: integrate a real email service (e.g., SMTP, SendGrid). Skipped here.
}
