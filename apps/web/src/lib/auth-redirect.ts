const allowedDestinations = new Set(["/dashboard", "/forgot-password?mode=update"]);

export type AuthDestination = "/dashboard" | "/forgot-password?mode=update";

export function getAuthDestination(requestedDestination: string | null): AuthDestination {
  if (requestedDestination && allowedDestinations.has(requestedDestination)) {
    return requestedDestination as AuthDestination;
  }

  return "/dashboard";
}
