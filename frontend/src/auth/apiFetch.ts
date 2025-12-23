import keycloak from "./keycloak";

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = keycloak.token;

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}
