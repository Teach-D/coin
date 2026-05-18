export class ApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly message: string | null;

  constructor(success: boolean, data: T | null, message: string | null) {
    this.success = success;
    this.data = data;
    this.message = message;
  }

  static ok<T>(data: T): ApiResponse<T> {
    return new ApiResponse(true, data, null);
  }

  static error(message: string): ApiResponse<null> {
    return new ApiResponse(false, null, message);
  }
}
