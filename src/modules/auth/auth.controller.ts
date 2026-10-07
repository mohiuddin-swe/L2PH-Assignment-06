import crypto from "crypto";
import { isProd } from "../../config/env";
import { AppError } from "../../errors/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getGoogleAuthUrl, getGoogleProfile, isGoogleConfigured } from "./google";
import { authService } from "./auth.service";

const register = catchAsync(async (req, res) => {
  const data = await authService.register(req.body, req.ip);
  sendResponse(res, { statusCode: 201, message: "Registration successful", data });
});

const login = catchAsync(async (req, res) => {
  const data = await authService.login(req.body, req.ip);
  sendResponse(res, { message: "Login successful", data });
});

const refreshToken = catchAsync(async (req, res) => {
  const data = await authService.refresh(req.body.refreshToken);
  sendResponse(res, { message: "Token refreshed successfully", data });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  sendResponse(res, { message: "Logged out successfully" });
});

const googleRedirect = catchAsync(async (_req, res) => {
  if (!isGoogleConfigured()) throw new AppError(501, "Google login is not configured");

  // `state` stored in a short-lived httpOnly cookie protects the callback against CSRF.
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 10 * 60 * 1000 });
  res.redirect(getGoogleAuthUrl(state));
});

const googleCallback = catchAsync(async (req, res) => {
  if (!isGoogleConfigured()) throw new AppError(501, "Google login is not configured");

  const { code, state } = req.query;
  if (typeof code !== "string" || typeof state !== "string" || state !== req.cookies?.oauth_state) {
    throw new AppError(400, "Invalid OAuth state");
  }
  res.clearCookie("oauth_state");

  const profile = await getGoogleProfile(code);
  const data = await authService.googleLogin(profile, req.ip);
  sendResponse(res, { message: "Google login successful", data });
});

export const authController = { register, login, refreshToken, logout, googleRedirect, googleCallback };