import rateLimit from 'express-rate-limit';

/**
 * Global Error Handling Middleware
 * Captures all unhandled errors and sends a formatted JSON response.
 */
export const globalErrorHandler = (err, req, res, next) => {
  console.error('[Global Error]', err);

  // If headers are already sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle specific error types
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

  // Default error response
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
};

/**
 * AI Request Rate Limiter
 * Limits concurrent requests to AI endpoints to prevent resource exhaustion.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit for AI requests. Please try again later.'
  }
});

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
