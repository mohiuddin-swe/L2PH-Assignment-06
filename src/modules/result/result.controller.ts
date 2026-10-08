import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { resultService } from "./result.service";
import { MyResultsQuery, OfferingResultsQuery } from "./result.validation";

const save = catchAsync(async (req, res) => {
  const data = await resultService.save(req.user!.id, req.body, req.ip);
  sendResponse(res, { message: "Result saved as draft", data });
});

const publish = catchAsync(async (req, res) => {
  const data = await resultService.publish(req.user!, req.params.id, req.ip);
  sendResponse(res, { message: "Results published successfully", data });
});

const listByOffering = catchAsync(async (req, res) => {
  const { data, meta } = await resultService.listByOffering(
    req.user!,
    req.params.id,
    req.query as unknown as OfferingResultsQuery,
  );
  sendResponse(res, { message: "Results fetched successfully", data, meta });
});

const mine = catchAsync(async (req, res) => {
  const data = await resultService.mine(req.user!.id, req.query as unknown as MyResultsQuery);
  sendResponse(res, { message: "Your results fetched successfully", data });
});

export const resultController = { save, publish, listByOffering, mine };