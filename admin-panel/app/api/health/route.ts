import { NextResponse } from "next/server";
import net from "node:net";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

async function httpCheck(name: string, url: string): Promise<Check> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return {
      name,
      ok: response.ok,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

function tcpCheck(name: string, host: string, port: number): Promise<Check> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean, detail: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ name, ok, detail });
    };
    socket.setTimeout(1500);
    socket.once("connect", () => finish(true, `TCP ${host}:${port}`));
    socket.once("timeout", () => finish(false, `Timed out ${host}:${port}`));
    socket.once("error", (error) =>
      finish(false, error.message || `Could not connect ${host}:${port}`),
    );
  });
}

/**
 * Unauthenticated liveness endpoint for uptime monitors and the launcher.
 * It only reports reachability, never data from the database.
 */
export async function GET() {
  const apiUrl = process.env.NULLCORD_API_URL || "http://127.0.0.1:14702";

  const [database, api, livekit, gateway, redis, voice] = await Promise.all([
    db()
      .command({ ping: 1 })
      .then(() => ({
        name: "MongoDB",
        ok: true,
        detail: "Ping succeeded",
      }))
      .catch((error) => ({
        name: "MongoDB",
        ok: false,
        detail: error instanceof Error ? error.message : "Ping failed",
      })),
    httpCheck("API", apiUrl),
    httpCheck("LiveKit", "http://127.0.0.1:7880/"),
    tcpCheck("Gateway", "127.0.0.1", 14703),
    tcpCheck("Redis", "127.0.0.1", 6379),
    tcpCheck("Voice webhook", "127.0.0.1", 8500),
  ]);

  const checks = [database, api, livekit, gateway, redis, voice];
  const ok = checks.every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      service: "nullcord-admin",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: ok ? 200 : 503 },
  );
}
