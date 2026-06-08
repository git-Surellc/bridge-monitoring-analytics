/**
 * Global Error Handling Middleware
 * Captures all unhandled errors and sends a formatted JSON response.
 */
export const globalErrorHandler = (err, req, res, next) => {
  console.error('[Global Error]', err);

  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'The request body is too large. Please reduce the size of your upload.'
    });
  }

  if (err.type === 'request.aborted' || err.code === 'ECONNABORTED') {
    return res.status(400).json({
      error: 'Request Aborted',
      message: 'The request was aborted by the client or timed out.'
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON payload.'
    });
  }

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
};

/**
 * Upload Timeout Handler
 * Sets a timeout for upload requests to prevent hanging connections.
 */
export const uploadTimeout = (timeoutMs = 300000) => (req, res, next) => {
  res.setTimeout(timeoutMs, () => {
    res.status(408).json({
      error: 'Request Timeout',
      message: 'The upload took too long to complete.'
    });
  });
  next();
};
