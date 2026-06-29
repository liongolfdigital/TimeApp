export function branchForbiddenError() {
  const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
  error.status = 403;
  return error;
}

export function badRequestError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function createHandleApiError({ isProduction }) {
  return function handleApiError(response, error, context = "api") {
    const requestedStatus = Number(error?.status);
    const status = Number.isInteger(requestedStatus)
      && requestedStatus >= 400
      && requestedStatus <= 599
      ? requestedStatus
      : 500;
    if (status >= 500) console.error(`[${context}] failed:`, error);

    const internalMessage = error?.payload?.error
      || error?.message
      || "Khong the xu ly yeu cau.";
    const payload = {
      error: status >= 500 && isProduction
        ? "Khong the xu ly yeu cau. Loi may chu."
        : internalMessage,
    };
    if (status >= 500 && !isProduction) payload.detail = internalMessage;
    return response.status(status).json(payload);
  };
}
