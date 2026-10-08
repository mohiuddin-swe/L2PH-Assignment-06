import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { attendanceService } from "./attendance.service";
import { MyAttendanceQuery, OfferingAttendanceQuery } from "./attendance.validation";

const mark = catchAsync(async (req, res) => {
  const data = await attendanceService.mark(req.user!, req.body, req.ip);
  sendResponse(res, { message: "Attendance saved successfully", data });
});

const listByOffering = catchAsync(async (req, res) => {
  const { data, meta } = await attendanceService.listByOffering(
    req.user!,
    req.params.id,
    req.query as unknown as OfferingAttendanceQuery,
  );
  sendResponse(res, { message: "Attendance fetched successfully", data, meta });
});

const mine = catchAsync(async (req, res) => {
  const data = await attendanceService.mine(req.user!.id, req.query as unknown as MyAttendanceQuery);
  sendResponse(res, { message: "Your attendance fetched successfully", data });
});

export const attendanceController = { mark, listByOffering, mine };