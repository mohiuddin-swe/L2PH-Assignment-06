import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { courseService } from "./course.service";
import { ListCoursesQuery } from "./course.validation";

const create = catchAsync(async (req, res) => {
  const data = await courseService.create(req.body, req.user!.id, req.ip);
  sendResponse(res, { statusCode: 201, message: "Course created successfully", data });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await courseService.list(req.query as unknown as ListCoursesQuery);
  sendResponse(res, { message: "Courses fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await courseService.getById(req.params.id);
  sendResponse(res, { message: "Course fetched successfully", data });
});

const update = catchAsync(async (req, res) => {
  const data = await courseService.update(req.params.id, req.body, req.user!.id, req.ip);
  sendResponse(res, { message: "Course updated successfully", data });
});

const remove = catchAsync(async (req, res) => {
  await courseService.remove(req.params.id, req.user!.id, req.ip);
  sendResponse(res, { message: "Course deleted successfully" });
});

export const courseController = { create, list, getById, update, remove };