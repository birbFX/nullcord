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
