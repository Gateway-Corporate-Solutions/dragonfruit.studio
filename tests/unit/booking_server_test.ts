import { equal, match } from "node:assert/strict";
import { BOOKING_SERVER_SOURCE } from "../../src/domain/booking-server.ts";
import { COMMERCE_SERVER_SOURCE } from "../../src/domain/commerce-runtime.ts";
import { defaultCommerce, parseCommerce } from "../../src/domain/commerce.ts";
import { fillSchedule } from "../../src/domain/schedule.ts";

const runtime = () =>
  import("data:text/javascript," + encodeURIComponent(BOOKING_SERVER_SOURCE));
const slot = {
  id: "morning",
  title: "Consultation",
  start: "2099-01-05T09:00:00Z",
  end: "2099-01-05T10:00:00Z",
  bookingUrl: "",
};
const site = {
  commerce: {
    businessEmail: "business@example.com",
    slots: [slot, { ...slot, id: "overlap", start: "2099-01-05T09:30:00Z" }, {
      ...slot,
      id: "adjacent",
      start: slot.end,
      end: "2099-01-05T11:00:00Z",
    }],
  },
};
const request = (id: string, slotId = "morning") =>
  new Request("https://site.test/api/commerce/book", {
    method: "POST",
    headers: {
      origin: "https://site.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id,
      slotId,
      name: "Customer",
      email: "customer@example.com",
      notes: "Consultation details",
    }),
  });

Deno.test("native bookings persist, serialize overlapping reservations, notify and attach calendar events", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const env = (key: string) =>
      ({
        BOOKINGS_FILE: directory + "/bookings.json",
        RESEND_API_KEY: "test",
        BOOKINGS_EMAIL_FROM: "appointments@example.com",
      })[key];
    const { handleBooking } = await runtime();
    const messages: Record<string, unknown>[] = [];
    const send = (_url: string, init: RequestInit) => {
      messages.push(JSON.parse(String(init.body)));
      return Promise.resolve(Response.json({ id: "mail" }));
    };
    const responses = await Promise.all([
      handleBooking(request("request-one-00000001"), site, env, send),
      handleBooking(
        request("request-two-00000002", "overlap"),
        site,
        env,
        send,
      ),
    ]);
    equal(responses.filter((response) => response.status === 201).length, 1);
    equal(responses.filter((response) => response.status === 409).length, 1);
    equal(messages.length, 1);
    equal((messages[0].to as string[])[0], "business@example.com");
    match(String(messages[0].text), /calendar.google.com/);
    match(
      atob((messages[0].attachments as { content: string }[])[0].content),
      /BEGIN:VEVENT\r\n/,
    );
    const schedule = await handleBooking(
      new Request("https://site.test/api/commerce/schedule"),
      site,
      env,
      send,
    );
    equal((await schedule.json()).slots.length, 1);
    const { handleBooking: restarted } = await runtime();
    equal(
      (await restarted(request("another-request-000003"), site, env, send))
        .status,
      409,
    );
    equal(
      (await restarted(
        request("adjacent-request-00004", "adjacent"),
        site,
        env,
        send,
      )).status,
      201,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("notification failure keeps reservation and identical retry resends without double booking", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const env = (key: string) =>
      ({
        BOOKINGS_FILE: directory + "/bookings.json",
        RESEND_API_KEY: "test",
        BOOKINGS_EMAIL_FROM: "appointments@example.com",
      })[key];
    const { handleBooking } = await runtime();
    const failed = await handleBooking(
      request("retry-request-0000001"),
      site,
      env,
      () => Promise.resolve(new Response("", { status: 503 })),
    );
    equal((await failed.json()).notificationSent, false);
    const retried = await handleBooking(
      request("retry-request-0000001"),
      site,
      env,
      () => Promise.resolve(Response.json({ id: "mail" })),
    );
    equal((await retried.json()).notificationSent, true);
    equal(
      (JSON.parse(await Deno.readTextFile(directory + "/bookings.json")))
        .length,
      1,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("commerce accepts native schedules and routes reservations through the shared handler", async () => {
  const config = parseCommerce({
    ...defaultCommerce(),
    businessEmail: "business@example.com",
    slots: [slot],
  });
  equal(config?.businessEmail, "business@example.com");
  const slots = fillSchedule({
    title: "Consultation",
    bookingUrl: "",
    startDate: "2099-01-05",
    weeks: 1,
    days: [1],
    opens: "09:00",
    closes: "10:00",
    duration: 60,
    timeZone: "UTC",
  });
  equal(slots.length, 1);
  equal(slots[0].bookingUrl, "");
  const { handleCommerce } = await import(
    "data:text/javascript," + encodeURIComponent(COMMERCE_SERVER_SOURCE)
  );
  equal(
    (await handleCommerce(
      request("unconfigured-0000001"),
      { commerce: config },
      () => "",
    )).status,
    503,
  );
});

Deno.test("native bookings reject stale slots, changed reservation times, invalid requests and unsafe origins", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const env = (key: string) =>
      ({
        BOOKINGS_FILE: directory + "/bookings.json",
        RESEND_API_KEY: "test",
        BOOKINGS_EMAIL_FROM: "appointments@example.com",
      })[key];
    const { handleBooking } = await runtime();
    const send = () => Promise.resolve(Response.json({ id: "mail" }));
    const unsafe = request("unsafe-origin-000001");
    unsafe.headers.set("origin", "https://other.test");
    equal((await handleBooking(unsafe, site, env, send)).status, 403);
    equal(
      (await handleBooking(
        request("missing-slot-0000001", "missing"),
        site,
        env,
        send,
      )).status,
      409,
    );
    equal(
      (await handleBooking(
        request("past-appointment-001"),
        {
          commerce: {
            ...site.commerce,
            slots: [{
              ...slot,
              start: "2000-01-01T09:00:00Z",
              end: "2000-01-01T10:00:00Z",
            }],
          },
        },
        env,
        send,
      )).status,
      409,
    );
    const invalid = new Request("https://site.test/api/commerce/book", {
      method: "POST",
      headers: {
        origin: "https://site.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "invalid-booking-0001",
        slotId: "morning",
        name: "Customer",
        email: "bad",
        notes: "",
      }),
    });
    equal((await handleBooking(invalid, site, env, send)).status, 400);
    equal(
      (await handleBooking(request("persisted-booking-001"), site, env, send))
        .status,
      201,
    );
    const changed = {
      commerce: {
        ...site.commerce,
        slots: [{ ...slot, id: "renamed-session" }],
      },
    };
    equal(
      (await handleBooking(
        request("changed-slot-0000001", "renamed-session"),
        changed,
        env,
        send,
      )).status,
      409,
    );
    await Deno.writeTextFile(directory + "/bookings.json", "invalid data");
    equal(
      (await handleBooking(request("corrupt-storage-00001"), site, env, send))
        .status,
      503,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
