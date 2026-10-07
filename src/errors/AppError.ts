export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors: unknown[] = [],
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}