import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createApp } from "./index";

const app = createApp();

const env = {
  AUTH_MODE: "test" as const,
  TEST_ADMIN_EMAIL: process.env.TEST_ADMIN_EMAIL ?? "admin@local.test",
  SEED_FIXTURES: process.env.SEED_FIXTURES ?? "false"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1:8787"}`);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    // `local-dev.ts` bridges Node's request/response objects to the Worker app.
    // Cast at the boundary so the rest of the app can stay typed for Workers.
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method && ["GET", "HEAD"].includes(req.method) ? undefined : (Readable.toWeb(req) as BodyInit),
      duplex: "half"
    } as RequestInit);

    const response = await app.fetch(
      request,
      env as never,
      {
        waitUntil() {},
        passThroughOnException() {},
        props: {}
      } as unknown as ExecutionContext
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!response.body) {
      res.end();
      return;
    }

    const stream = Readable.fromWeb(response.body as unknown as NodeReadableStream);
    stream.pipe(res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown server error"
      })
    );
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, "127.0.0.1", () => {
  console.log(`Local API ready at http://127.0.0.1:${port}`);
});
