import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { enrollmentService } from "./enrollment.service";
import { MyEnrollmentsQuery, OfferingEnrollmentsQuery } from "./enrollment.validation";

const enroll = catchAsync(async (req, res) => {
  const data = await enrollmentService.enroll(req.user!.id, req.body.offeringId, req.ip);
  sendResponse(res, { statusCode: 201, message: "Enrolled successfully", data });
});

const drop = catchAsync(async (req, res) => {
  const data = await enrollmentService.drop(req.params.id, req.user!.id, req.ip);
  sendResponse(res, { message: "Enrollment dropped successfully", data });
});

const listMine = catchAsync(async (req, res) => {
  const { data, meta } = await enrollmentService.listMine(req.user!.id, req.query as unknown as MyEnrollmentsQuery);
  sendResponse(res, { message: "Enrollments fetched successfully", data, meta });
});

const listByOffering = catchAsync(async (req, res) => {
  const { data, meta } = await enrollmentService.listByOffering(
    req.user!,
    req.params.id,
    req.query as unknown as OfferingEnrollmentsQuery,
  );
  sendResponse(res, { message: "Offering students fetched successfully", data, meta });
});

export const enrollmentController = { enroll, drop, listMine, listByOffering };