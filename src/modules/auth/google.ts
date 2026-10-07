import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { AppError } from "../../errors/AppError";

export const isGoogleConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL);

const getClient = () => new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);

export const getGoogleAuthUrl = (state: string) =>
  getClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

export const getGoogleProfile = async (code: string) => {
  try {
    const client = getClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error("No id_token");

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new AppError(401, "Google account email is not verified");
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email.split("@")[0],
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, "Google authentication failed");
  }
};