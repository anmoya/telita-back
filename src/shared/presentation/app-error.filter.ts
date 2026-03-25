import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { AppError } from "../application/errors/app-error";

@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter<AppError> {
  catch(exception: AppError, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<{
      status: (code: number) => {
        json: (body: Record<string, unknown>) => void;
      };
    }>();
    const request = context.getRequest<{ url?: string }>();
    const status = getStatusCode(exception);

    response.status(status).json({
      statusCode: status,
      error: getStatusLabel(status),
      message: exception.message,
      path: request.url ?? "",
      timestamp: new Date().toISOString()
    });
  }
}

function getStatusCode(exception: AppError) {
  switch (exception.kind) {
    case "not_found":
      return HttpStatus.NOT_FOUND;
    case "conflict":
      return HttpStatus.CONFLICT;
    case "forbidden":
      return HttpStatus.FORBIDDEN;
    case "unauthorized":
      return HttpStatus.UNAUTHORIZED;
    case "validation":
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function getStatusLabel(status: number) {
  switch (status) {
    case HttpStatus.NOT_FOUND:
      return "Not Found";
    case HttpStatus.CONFLICT:
      return "Conflict";
    case HttpStatus.FORBIDDEN:
      return "Forbidden";
    case HttpStatus.UNAUTHORIZED:
      return "Unauthorized";
    default:
      return "Bad Request";
  }
}
