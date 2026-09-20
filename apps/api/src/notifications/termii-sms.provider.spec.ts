import { describe, expect, it, vi } from "vitest";
import { TermiiSmsProvider } from "./termii-sms.provider";

const options = { apiKey: "key", senderId: "Readi", baseUrl: "https://termii.example" };

describe("TermiiSmsProvider", () => {
  it("posts a DND plain SMS with the number in international format without +", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );

    await new TermiiSmsProvider({ ...options, fetch: fetchMock }).send({
      to: "+2348031234567",
      text: "Your Readi code is 123456.",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).toString()).toBe("https://termii.example/api/sms/send");
    expect(JSON.parse(init?.body as string)).toEqual({
      api_key: "key",
      to: "2348031234567",
      from: "Readi",
      sms: "Your Readi code is 123456.",
      type: "plain",
      channel: "dnd",
    });
  });

  it("throws on a non-2xx response without echoing the number", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("bad", { status: 400 })),
    );

    const send = new TermiiSmsProvider({ ...options, fetch: fetchMock }).send({
      to: "+2348031234567",
      text: "x",
    });

    await expect(send).rejects.toThrow("HTTP 400");
    await expect(send).rejects.not.toThrow("2348031234567");
  });
});
