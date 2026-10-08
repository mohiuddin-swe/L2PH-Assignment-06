import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { adminAuditService } from "./admin.audit.service";
import { adminStatsService } from "./admin.stats.service";
import { adminUserService } from "./admin.user.service";
import { AuditLogsQuery, ListUsersQuery } from "./admin.validation";

const createUser = catchAsync(async (req, res) => {
  const data = await adminUserService.create(req.body, req.user!.id, req.ip);
  sendResponse(res, { statusCode: 201, message: "User created successfully", data });
});

const listUsers = catchAsync(async (req, res) => {
  const { data, meta } = await adminUserService.list(req.query as unknown as ListUsersQuery);
  sendResponse(res, { message: "Users fetched successfully", data, meta });
});

const getUser = catchAsync(async (req, res) => {
  const data = await adminUserService.getById(req.params.id);
  sendResponse(res, { message: "User fetched successfully", data });
});

const changeRole = catchAsync(async (req, res) => {
  const data = await adminUserService.changeRole(req.user!.id, req.params.id, req.body.role, req.ip);
  sendResponse(res, { message: "User role updated successfully", data });
});

const changeStatus = catchAsync(async (req, res) => {
  const data = await adminUserService.changeStatus(req.user!.id, req.params.id, req.body.status, req.ip);
  sendResponse(res, { message: "User status updated successfully", data });
});

const removeUser = catchAsync(async (req, res) => {
  await adminUserService.remove(req.user!.id, req.params.id, req.ip);
  sendResponse(res, { message: "User deleted successfully" });
});

const stats = catchAsync(async (_req, res) => {
  const data = await adminStatsService.getStats();
  sendResponse(res, { message: "Dashboard statistics fetched successfully", data });
});

const auditLogs = catchAsync(async (req, res) => {
  const { data, meta } = await adminAuditService.list(req.query as unknown as AuditLogsQuery);
  sendResponse(res, { message: "Audit logs fetched successfully", data, meta });
});

export const adminController = { createUser, listUsers, getUser, changeRole, changeStatus, removeUser, stats, auditLogs };