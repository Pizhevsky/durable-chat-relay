export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'APP_ERROR'
  ) {
    super(message)
  }
}

export function toHttpError(error: unknown): { statusCode: number; message: string; code: string } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code
    }
  }

  return {
    statusCode: 500,
    message: 'Unexpected server error',
    code: 'INTERNAL_ERROR'
  }
}
