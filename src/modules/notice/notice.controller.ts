import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { noticeService } from "./notice.service";
import { ListNoticesQuery } from "./notice.validation";

const create = catchAsync(async (req, res) => {
  const data = await noticeService.create(req.user!, req.body, req.ip);
  sendResponse(res, { statusCode: 201, message: "Notice published successfully", data });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await noticeService.list(req.query as unknown as ListNoticesQuery);
  sendResponse(res, { message: "Notices fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await noticeService.getById(req.params.id);
  sendResponse(res, { message: "Notice fetched successfully", data });
});

const update = catchAsync(async (req, res) => {
  const data = await noticeService.update(req.user!, req.params.id, req.body, req.ip);
  sendResponse(res, { message: "Notice updated successfully", data });
});

const remove = catchAsync(async (req, res) => {
  await noticeService.remove(req.user!, req.params.id, req.ip);
  sendResponse(res, { message: "Notice deleted successfully" });
});

export const noticeController = { create, list, getById, update, remove };