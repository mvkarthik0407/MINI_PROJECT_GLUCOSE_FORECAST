const DEFAULT_API_URL = "http://10.0.2.2:8000";

export function createApi({ baseUrl = DEFAULT_API_URL, patientId, accessToken } = {}) {
  return async function api(path, options = {}) {
    const identity = patientId?.trim();
    if (!identity && !accessToken) {
      throw new Error("Configure a patient identity before continuing.");
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(identity ? { "x-patient-id": identity } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const responseText = await response.text();
    let body = {};
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = { detail: responseText };
      }
    }
    if (!response.ok) {
      throw new Error(typeof body.detail === "string" ? body.detail : "Request failed.");
    }
    return body;
  };
}

