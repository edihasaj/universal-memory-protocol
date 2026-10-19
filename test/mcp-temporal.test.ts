import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createMcpServer,
  InMemoryStore,
  UmpServer,
} from "../src/index.ts";

const OWNER = "did:key:zTemporalOwner";

async function connectedMcp() {
  const ump = new UmpServer({
    name: "temporal-test",
    version: "0",
    store: new InMemoryStore(),
  });
  const server = createMcpServer(ump, { owner: OWNER });
  const client = new Client({ name: "temporal-test-client", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

function textResult(result: unknown) {
  const content = (result as {
    content?: Array<{ type: string; text?: string }>;
  }).content?.[0];
  expect(content?.type).toBe("text");
  return JSON.parse(content?.text ?? "{}");
}

describe("MCP temporal discoverability", () => {
  it("publishes temporal and scope schemas through a real MCP client", async () => {
    const { client } = await connectedMcp();
    const tools = await client.listTools();
    const recall = tools.tools.find((tool) => tool.name === "ump.recall");
    const remember = tools.tools.find((tool) => tool.name === "ump.remember");
    const get = tools.tools.find((tool) => tool.name === "ump.get");
    const revise = tools.tools.find((tool) => tool.name === "ump.revise");
    const forget = tools.tools.find((tool) => tool.name === "ump.forget");
    const feedback = tools.tools.find((tool) => tool.name === "ump.feedback");

    expect(recall).toBeDefined();
    const recallProperties = recall!.inputSchema.properties as Record<string, any>;
    const scope = recallProperties.scope.properties as Record<string, any>;
    expect(Object.keys(scope)).toEqual(
      expect.arrayContaining(["owner", "project", "user", "agent", "session", "visibility"]),
    );
    expect(scope.owner.description).toContain(OWNER);
    expect(scope.owner.examples).toContain(OWNER);
    expect(scope.project.description).toMatch(/exact.*identifier.*do not strip/i);
    expect(recall!.annotations).toMatchObject({ readOnlyHint: true });
    const filter = recallProperties.filter.properties as Record<string, any>;
    expect(filter.valid_at).toMatchObject({ type: "string", format: "date-time" });
    expect(filter.kind.items.enum).toContain("semantic");
    expect(filter.status.items.enum).toContain("active");

    const rememberTime = (remember!.inputSchema.properties as Record<string, any>)
      .time.properties as Record<string, any>;
    expect(Object.keys(rememberTime)).toEqual(
      expect.arrayContaining(["created", "observed", "valid_from", "valid_to"]),
    );
    expect(rememberTime.valid_to.anyOf).toEqual(
      expect.arrayContaining([{ type: "null" }]),
    );
    expect((remember!.inputSchema.properties as Record<string, any>)
      .body.required).toContain("text");
    expect((remember!.inputSchema.properties as Record<string, any>)
      .scope.required).toEqual(expect.arrayContaining(["owner", "visibility"]));
    const wrappedDraft = (remember!.inputSchema.properties as Record<string, any>)
      .record as Record<string, any>;
    expect(wrappedDraft.required).toEqual(
      expect.arrayContaining(["kind", "body", "scope"]),
    );
    expect(remember!.annotations).toMatchObject({ readOnlyHint: false });
    expect(get!.annotations).toMatchObject({ readOnlyHint: true });
    expect(revise!.annotations).toMatchObject({ readOnlyHint: false });
    expect(forget!.annotations).toMatchObject({ readOnlyHint: false });
    expect(feedback!.annotations).toMatchObject({ readOnlyHint: false });

    const patch = (revise!.inputSchema.properties as Record<string, any>)
      .patch.properties as Record<string, any>;
    expect(Object.keys(patch)).toEqual(
      expect.arrayContaining(["body", "lifecycle", "relations", "time"]),
    );
    expect(Object.keys(patch.time.properties)).toEqual(
      expect.arrayContaining(["observed", "valid_from", "valid_to"]),
    );
    expect(patch.time.properties.created).toBeUndefined();
    const capabilitiesTool = tools.tools.find((tool) => tool.name === "ump.capabilities");
    expect(capabilitiesTool!.description).toContain(OWNER);
    expect(capabilitiesTool!.annotations).toMatchObject({ readOnlyHint: true });
    const capabilities = textResult(await client.callTool({
      name: "ump.capabilities",
      arguments: {},
    }));
    expect(capabilities.scope_hint).toEqual({ owner: OWNER });
  });

  it("filters valid time through MCP without treating an owner hint as authority", async () => {
    const { client } = await connectedMcp();
    const scope = {
      owner: OWNER,
      project: "github.com/acme/history",
      visibility: "private",
    };

    const bounded = textResult(await client.callTool({
      name: "ump.remember",
      arguments: {
        kind: "semantic",
        body: { text: "migration provider was Hetzner" },
        scope,
        time: {
          created: "2025-01-01T00:00:00Z",
          observed: "2025-01-02T00:00:00Z",
          valid_from: "2025-01-01T00:00:00Z",
          valid_to: "2025-03-01T00:00:00Z",
        },
      },
    }));
    const future = textResult(await client.callTool({
      name: "ump.remember",
      arguments: {
        record: {
          kind: "semantic",
          body: { text: "future provider will be Neptune" },
          scope,
          time: {
            observed: "2025-01-03T00:00:00Z",
            valid_from: "2999-01-01T00:00:00Z",
            valid_to: null,
          },
        },
      },
    }));

    const atInclusiveEnd = textResult(await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "migration",
        scope: { owner: OWNER, project: scope.project },
        filter: { valid_at: "2025-03-01T00:00:00Z" },
      },
    }));
    expect(atInclusiveEnd.results.map((r: { record: { id: string } }) => r.record.id))
      .toContain(bounded.id);

    const afterEnd = textResult(await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "migration",
        scope: { owner: OWNER, project: scope.project },
        filter: { valid_at: "2025-03-01T00:00:01Z" },
      },
    }));
    expect(afterEnd.results.map((r: { record: { id: string } }) => r.record.id))
      .not.toContain(bounded.id);

    const current = textResult(await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "future provider",
        scope: { owner: OWNER, project: scope.project },
      },
    }));
    expect(current.results.map((r: { record: { id: string } }) => r.record.id))
      .not.toContain(future.id);

    const futureDate = textResult(await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "future provider",
        scope: { owner: OWNER, project: scope.project },
        filter: { valid_at: "3000-01-01T00:00:00Z" },
      },
    }));
    expect(futureDate.results.map((r: { record: { id: string } }) => r.record.id))
      .toContain(future.id);

    const fetched = textResult(await client.callTool({
      name: "ump.get",
      arguments: { id: bounded.id },
    }));
    expect(fetched.record.time.observed).toBe("2025-01-02T00:00:00Z");

    const revised = textResult(await client.callTool({
      name: "ump.revise",
      arguments: {
        id: bounded.id,
        patch: {
          time: {
            observed: "2025-02-15T00:00:00Z",
            valid_from: "2025-02-01T00:00:00Z",
            valid_to: "2025-03-01T00:00:00Z",
          },
        },
      },
    }));
    const revisedRecord = textResult(await client.callTool({
      name: "ump.get",
      arguments: { id: revised.id },
    }));
    expect(revisedRecord.record.time.observed).toBe("2025-02-15T00:00:00Z");

    const invalidDate = await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "migration",
        scope: { owner: OWNER, project: scope.project },
        filter: { valid_at: "not-a-date" },
      },
    });
    expect((invalidDate as { isError?: boolean }).isError).toBe(true);

    const highPrecisionDate = await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "migration",
        scope: { owner: OWNER, project: scope.project },
        filter: { valid_at: "2025-03-01T00:00:00.1234Z" },
      },
    });
    expect((highPrecisionDate as { isError?: boolean }).isError).toBe(true);

    const unscoped = textResult(await client.callTool({
      name: "ump.recall",
      arguments: {
        query: "migration",
        filter: { valid_at: "2025-03-01T00:00:00Z" },
      },
    }));
    expect(unscoped.results).toEqual([]);
  });

  it("omits discovery metadata when the binding has no configured owner", async () => {
    const ump = new UmpServer({
      name: "temporal-test",
      version: "0",
      store: new InMemoryStore(),
    });
    const server = createMcpServer(ump);
    const client = new Client({ name: "temporal-test-client", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const capabilities = textResult(await client.callTool({
      name: "ump.capabilities",
      arguments: {},
    }));
    expect(capabilities.scope_hint).toBeUndefined();
  });
});
