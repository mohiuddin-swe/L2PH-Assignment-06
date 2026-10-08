import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { invoiceService } from "./invoice.service";
import { ListInvoicesQuery, MyInvoicesQuery } from "./invoice.validation";

const create = catchAsync(async (req, res) => {
  const data = await invoiceService.create(req.body, req.user!.id, req.ip);
  sendResponse(res, { statusCode: 201, message: "Invoice created successfully", data });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await invoiceService.list(req.query as unknown as ListInvoicesQuery);
  sendResponse(res, { message: "Invoices fetched successfully", data, meta });
});

const listMine = catchAsync(async (req, res) => {
  const { data, meta } = await invoiceService.listMine(req.user!.id, req.query as unknown as MyInvoicesQuery);
  sendResponse(res, { message: "Your invoices fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await invoiceService.getById(req.user!, req.params.id);
  sendResponse(res, { message: "Invoice fetched successfully", data });
});

const cancel = catchAsync(async (req, res) => {
  const data = await invoiceService.cancel(req.params.id, req.user!.id, req.ip);
  sendResponse(res, { message: "Invoice cancelled successfully", data });
});

export const invoiceController = { create, list, listMine, getById, cancel };