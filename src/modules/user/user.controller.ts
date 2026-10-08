import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";

const getMe = catchAsync(async (req, res) => {
  const data = await userService.getMe(req.user!.id);
  sendResponse(res, { message: "Profile fetched successfully", data });
});

const updateMe = catchAsync(async (req, res) => {
  const data = await userService.updateMe(req.user!.id, req.body, req.ip);
  sendResponse(res, { message: "Profile updated successfully", data });
});

export const userController = { getMe, updateMe };