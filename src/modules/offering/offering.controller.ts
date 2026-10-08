import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { offeringService } from "./offering.service";
import { ListOfferingsQuery, MyAssignedQuery } from "./offering.validation";

const create = catchAsync(async (req, res) => {
  const data = await offeringService.create(req.body, req.user!.id, req.ip);
  sendResponse(res, { statusCode: 201, message: "Course offering created successfully", data });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await offeringService.list(req.query as unknown as ListOfferingsQuery);
  sendResponse(res, { message: "Course offerings fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await offeringService.getById(req.params.id);
  sendResponse(res, { message: "Course offering fetched successfully", data });
});

const assignTeacher = catchAsync(async (req, res) => {
  const data = await offeringService.assignTeacher(req.params.id, req.body.teacherId, req.user!.id, req.ip);
  sendResponse(res, { message: "Teacher assigned successfully", data });
});

const updateCapacity = catchAsync(async (req, res) => {
  const data = await offeringService.updateCapacity(req.params.id, req.body.capacity, req.user!.id, req.ip);
  sendResponse(res, { message: "Capacity updated successfully", data });
});

const remove = catchAsync(async (req, res) => {
  await offeringService.remove(req.params.id, req.user!.id, req.ip);
  sendResponse(res, { message: "Course offering deleted successfully" });
});

const myAssigned = catchAsync(async (req, res) => {
  const { data, meta } = await offeringService.myAssigned(req.user!.id, req.query as unknown as MyAssignedQuery);
  sendResponse(res, { message: "Assigned offerings fetched successfully", data, meta });
});

export const offeringController = { create, list, getById, assignTeacher, updateCapacity, remove, myAssigned };