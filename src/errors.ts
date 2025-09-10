export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ErrorHandler {
  static handle(error: Error): void {
    if (error instanceof AppError) {
      console.error(`Error [${error.code}]: ${error.message}`);
      process.exit(error.statusCode === 500 ? 1 : 0);
    } else {
      console.error('Unexpected error:', (error as any)?.message ?? error);
      process.exit(1);
    }
  }
}

