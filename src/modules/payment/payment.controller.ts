import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { paymentService } from "./payment.service";
import { ListPaymentsQuery, MyPaymentsQuery } from "./payment.validation";

const initiate = catchAsync(async (req, res) => {
  const data = await paymentService.initiate(req.user!, req.body.invoiceId, req.ip);
  sendResponse(res, { statusCode: 201, message: "Payment initiated. Open gatewayUrl to complete the payment", data });
});

const listMine = catchAsync(async (req, res) => {
  const { data, meta } = await paymentService.listMine(req.user!.id, req.query as unknown as MyPaymentsQuery);
  sendResponse(res, { message: "Your payments fetched successfully", data, meta });
});

const list = catchAsync(async (req, res) => {
  const { data, meta } = await paymentService.list(req.query as unknown as ListPaymentsQuery);
  sendResponse(res, { message: "Payments fetched successfully", data, meta });
});

const getById = catchAsync(async (req, res) => {
  const data = await paymentService.getById(req.user!, req.params.id);
  sendResponse(res, { message: "Payment fetched successfully", data });
});

// Gateway callbacks: the gateway sends form data (POST). Query string is accepted too.
const payload = (req: { body?: unknown; query: unknown }) => ({
  ...(req.query as Record<string, unknown>),
  ...((req.body ?? {}) as Record<string, unknown>),
});

const gatewaySuccess = catchAsync(async (req, res) => {
  const data = await paymentService.settle(payload(req), req.ip);
  sendResponse(res, { message: "Payment successful", data });
});

const gatewayFail = catchAsync(async (req, res) => {
  const data = await paymentService.closeUnfinished(payload(req), "FAILED", req.ip);
  sendResponse(res, { message: "Payment failed", data });
});

const gatewayCancel = catchAsync(async (req, res) => {
  const data = await paymentService.closeUnfinished(payload(req), "CANCELLED", req.ip);
  sendResponse(res, { message: "Payment cancelled", data });
});

const gatewayIpn = catchAsync(async (req, res) => {
  const data = await paymentService.handleIpn(payload(req), req.ip);
  sendResponse(res, { message: "IPN processed", data });
});

export const paymentController = { initiate, listMine, list, getById, gatewaySuccess, gatewayFail, gatewayCancel, gatewayIpn };