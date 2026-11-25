
export interface BanViolation {
    reason: string;
    created_at?: string | null;
}

export interface BanInfo {
    type: "AccountBanned" | "IpBanned";
    message?: string | null;
    expiresAt?: string | null;
    violations?: BanViolation[];
}

/**
 * Pull structured ban information out of an API error so the login screen
 * can render the full account-standing page instead of a one-line error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractBanInfo(error: any): BanInfo | undefined {
    const data = error?.response?.data;
    if (data?.type !== "AccountBanned" && data?.type !== "IpBanned") {
        return undefined;
    }

    const violations = Array.isArray(data.violations)
        ? data.violations
              .filter((entry: any) => entry && typeof entry.reason === "string")
              .map((entry: any) => ({
                  reason: entry.reason,
                  created_at: entry.created_at ?? null,
              }))
        : undefined;

    return {
        type: data.type,
        message: data.message || undefined,
        expiresAt: data.expires_at ?? null,
        violations,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function takeError(error: any): string {
    if (error.response) {
        const data = error.response.data;
        const type = data?.type;
        if (type === "AccountBanned" || type === "IpBanned") {
            const until = data.expires_at
                ? new Date(data.expires_at).toLocaleString()
                : "permanent";
            return `${type}: ${
                data.message ||
                (type === "IpBanned"
                    ? "Your IP address has been banned."
                    : "Your account has been banned.")
            } (${until})`;
        }
        if (type) {
            return type;
        }

        switch (error.response.status) {
            case 429:
                return "TooManyRequests";
            case 401:
                return "Unauthorized"
            case 403:
                return "Forbidden";
            default:
                console.error("API error", error.response.status, data);
                return `UnknownError (HTTP ${error.response.status})`;
        }
    } else if (error.request) {
        return "NetworkError";
    }

    console.error(error);
    const detail = error?.message ?? (typeof error === "string" ? error : "");
    return detail ? `UnknownError (${detail})` : "UnknownError";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapError(error: any): never {
    throw takeError(error);
}
