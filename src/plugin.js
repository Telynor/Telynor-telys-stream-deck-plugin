import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { WebSocketServer } from "ws";
import crypto from "node:crypto";

const clients = new Map();
const actionContexts = new Map();
const pending = new Map();
let globalSettings = {};

function send(client, message) {
  if (client?.socket?.readyState === 1) client.socket.send(JSON.stringify(message));
}

function withGlobalSettings(settings = {}) {
  return { ...settings, secret: globalSettings.pairingSecret || settings.secret || "" };
}

function matchingClient(buttonSettings = {}) {
  const settings = withGlobalSettings(buttonSettings);
  const secretMatches = (client) => Boolean(settings.secret) && client.secret === settings.secret;
  if (settings.userId && clients.has(settings.userId)) {
    const client = clients.get(settings.userId);
    return secretMatches(client) ? client : null;
  }
  return [...clients.values()].find(secretMatches);
}

function runConfiguredAction(ev, defaultActionId = null) {
  const settings = withGlobalSettings(ev.payload.settings ?? {});
  const client = matchingClient(settings);
  if (!client) return ev.action.showAlert();
  const actionId = settings.actionId || defaultActionId;
  if (!actionId) return ev.action.showAlert();
  const requestId = crypto.randomUUID();
  pending.set(requestId, ev.action);
  send(client, {
    type: "execute",
    requestId,
    actionId,
    payload: settings.payload ?? {},
    actionContext: ev.action.id
  });
  setTimeout(() => pending.delete(requestId), 10000);
}

class FoundryAction extends SingletonAction {
  constructor(defaultActionId = null) {
    super();
    this.defaultActionId = defaultActionId;
  }

  onWillAppear(ev) {
    actionContexts.set(ev.action.id, ev.action);
  }

  onWillDisappear(ev) {
    actionContexts.delete(ev.action.id);
  }

  onKeyDown(ev) {
    if (ev.action.manifestId === "com.telynor.foundry-integration.settings") return ev.action.showOk();
    runConfiguredAction(ev, this.defaultActionId);
  }

  onSendToPlugin(ev) {
    if (ev.payload?.event !== "requestCatalog") return;
    const client = matchingClient(ev.payload.settings ?? {});
    ev.action.sendToPropertyInspector({
      event: "catalog",
      connected: Boolean(client),
      users: [...clients.values()].map(({ user, world }) => ({ ...user, world })),
      catalog: client?.catalog ?? []
    });
  }
}

const definitions = [
  ["com.telynor.foundry-integration.settings", null],
  ["com.telynor.foundry-integration.universal", null],
  ["com.telynor.foundry-integration.open-document", "foundry.open-document"],
  ["com.telynor.foundry-integration.run-macro", "foundry.run-macro"],
  ["com.telynor.foundry-integration.token", "foundry.select-token"],
  ["com.telynor.foundry-integration.star-rail", null]
];

for (const [uuid, defaultActionId] of definitions) {
  streamDeck.actions.registerAction(new (action({ UUID: uuid })(class extends FoundryAction {
    constructor() { super(defaultActionId); }
  }))());
}

const server = new WebSocketServer({ host: "127.0.0.1", port: 17321 });
server.on("listening", () => {
  console.log("Tely's Stream Deck Integration | Foundry bridge listening on 127.0.0.1:17321");
  streamDeck.logger.info("Foundry bridge listening on 127.0.0.1:17321");
});
server.on("error", (error) => {
  console.error("Tely's Stream Deck Integration | Foundry bridge failed", error);
  streamDeck.logger.error("Foundry bridge failed", error);
});

server.on("connection", (socket) => {
  let client = null;
  socket.on("message", async (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === "hello") {
      client = { socket, secret: message.secret ?? "", user: message.user, world: message.world, catalog: message.catalog ?? [] };
      clients.set(message.user.id, client);
      return;
    }
    if (!client) return;
    if (message.type === "catalog") client.catalog = message.catalog ?? [];
    if (message.type === "result") {
      const context = pending.get(message.requestId);
      pending.delete(message.requestId);
      if (context) message.ok ? await context.showOk() : await context.showAlert();
    }
    if (message.type === "state") {
      for (const context of actionContexts.values()) {
        const settings = await context.getSettings();
        if (settings.actionId !== message.actionId) continue;
        if (message.state?.title !== undefined) await context.setTitle(String(message.state.title));
        if (message.state?.image) await context.setImage(message.state.image);
      }
    }
  });
  socket.on("close", () => {
    if (client && clients.get(client.user.id) === client) clients.delete(client.user.id);
  });
});

streamDeck.logger.setLevel("INFO");
streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
  globalSettings = ev.settings ?? {};
});
streamDeck.connect()
  .then(async () => {
    globalSettings = await streamDeck.settings.getGlobalSettings();
  })
  .catch((error) => streamDeck.logger.error("Plugin startup failed", error));
