import { Connection } from "../../../lib/connections";

export default function UserConnections({
    connections,
}: {
    connections: Connection[];
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {connections.map((c) => (
                <div
                    key={c.service + c.handle}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: "var(--secondary-background)",
                    }}>
                    <b>{c.label}</b>
                    <div style={{ textAlign: "right" }}>
                        {c.url ? (
                            <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer noopener nofollow">
                                {c.handle}
                            </a>
                        ) : (
                            <span>{c.handle}</span>
                        )}
                        {c.detail && (
                            <div style={{ opacity: 0.7, fontSize: "0.85em" }}>
                                {c.detail}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
