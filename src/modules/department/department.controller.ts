import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { departmentService } from "./department.service";
import { ListDepartmentsQuery } from "./department.validation";

const create = catchAsync(async (req, res) => {
  const data = await departmentService.create(req.body, req.user!.id, req.ip);
  sendResponse(res, { statusCode: 201, message: "Department created successfully", data });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await departmentService.list(req.query as unknown as ListDepartmentsQuery);
  sendResponse(res, { message: "Departments fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await departmentService.getById(req.params.id);
  sendResponse(res, { message: "Department fetched successfully", data });
});

const update = catchAsync(async (req, res) => {
  const data = await departmentService.update(req.params.id, req.body, req.user!.id, req.ip);
  sendResponse(res, { message: "Department updated successfully", data });
});

const remove = catchAsync(async (req, res) => {
  await departmentService.remove(req.params.id, req.user!.id, req.ip);
  sendResponse(res, { message: "Department deleted successfully" });
});

export const departmentController = { create, list, getById, update, remove };