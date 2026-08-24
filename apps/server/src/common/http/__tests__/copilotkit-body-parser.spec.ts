import { Controller, Module, Post, Req, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureCopilotKitBodyParser } from "../copilotkit-body-parser";

const called = vi.fn();
const runtimeCalled = vi.fn();
@Controller("copilotkit")
class ProbeController {
  @Post("limit-probe")
  probe(@Req() requestValue: { body: unknown }) {
    called();
    return requestValue.body;
  }
}
@Controller('internal/agent-runtime/runner')
class RuntimeProbeController {
  @Post('commands:poll')
  probe(@Req() requestValue: { body: unknown }) {
    runtimeCalled();
    return requestValue.body;
  }
}
@Module({ controllers: [ProbeController, RuntimeProbeController] })
class ProbeModule {}

describe("CopilotKit route JSON body limit", () => {
  let app: NestExpressApplication | null = null;
  afterEach(async () => { called.mockReset(); runtimeCalled.mockReset(); await app?.close(); app = null; });

  async function boot(): Promise<NestExpressApplication> {
    app = await NestFactory.create<NestExpressApplication>(ProbeModule, { bodyParser: false, logger: false });
    app.setGlobalPrefix("api", {
      exclude: [{ path: 'internal/agent-runtime/*path', method: RequestMethod.ALL }],
    });
    configureCopilotKitBodyParser(app);
    await app.listen(0, "127.0.0.1");
    return app;
  }

  it("rejects declared and chunked payloads above 1MiB before CopilotKit business handling", async () => {
    const server = (await boot()).getHttpServer();
    const oversized = "x".repeat(1_048_577);
    await request(server).post("/api/copilotkit/limit-probe").set("content-type", "application/json").set("content-length", String(Buffer.byteLength(JSON.stringify({ oversized })))).send({ oversized }).expect(413);
    await expect(sendChunked(server, JSON.stringify({ oversized }))).resolves.toBe(413);
    expect(called).not.toHaveBeenCalled();
  });

  it("keeps valid <=1MiB JSON on the scoped route and returns malformed JSON as 400", async () => {
    const server = (await boot()).getHttpServer();
    await request(server).post("/api/copilotkit/limit-probe").send({ hello: "world" }).expect(201, { hello: "world" });
    await request(server).post("/api/copilotkit/limit-probe").set("content-type", "application/json").send('{').expect(400);
    expect(called).toHaveBeenCalledOnce();
  });

  it('keeps Host Runner control outside /api and bounds it to 512KiB before controller admission', async () => {
    const server = (await boot()).getHttpServer();
    const oversized = 'x'.repeat(524_289);

    await request(server)
      .post('/internal/agent-runtime/runner/commands:poll')
      .set('content-type', 'application/json')
      .send({ oversized })
      .expect(413);

    expect(runtimeCalled).not.toHaveBeenCalled();
    const publicApiPrefix = '/api';
    await request(server)
      .post(`${publicApiPrefix}/internal/agent-runtime/runner/commands:poll`)
      .send({ hello: 'legacy API prefix' })
      .expect(404);
  });
});

function sendChunked(server: ReturnType<NestExpressApplication["getHttpServer"]>, body: string): Promise<number> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server has no TCP address");
  return new Promise((resolve, reject) => {
    const client = httpRequest({ host: "127.0.0.1", port: address.port, path: "/api/copilotkit/limit-probe", method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    client.once("error", reject);
    client.write(body.slice(0, 512_000));
    client.end(body.slice(512_000));
  });
}
