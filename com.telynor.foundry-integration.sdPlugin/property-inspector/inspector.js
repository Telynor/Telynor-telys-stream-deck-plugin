let websocket;
let uuid;
let actionUuid;
let settings = {};
let globalSettings = {};
const SETTINGS_ACTION = "com.telynor.foundry-integration.settings";

window.connectElgatoStreamDeckSocket = (port, propertyInspectorUUID, registerEvent, info, actionInfo) => {
  uuid = propertyInspectorUUID;
  const parsedActionInfo = JSON.parse(actionInfo);
  actionUuid = parsedActionInfo.action;
  const isSettingsAction = actionUuid === SETTINGS_ACTION;
  document.querySelector("#connection-settings").hidden = !isSettingsAction;
  document.querySelector("#action-settings").hidden = isSettingsAction;
  settings = parsedActionInfo.payload.settings ?? {};
  websocket = new WebSocket(`ws://127.0.0.1:${port}`);
  websocket.onopen = () => {
    websocket.send(JSON.stringify({ event: registerEvent, uuid }));
    fillFromSettings();
    websocket.send(JSON.stringify({ event: "getGlobalSettings", context: uuid }));
    requestCatalog();
  };
  websocket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.event === "didReceiveGlobalSettings") {
      globalSettings = message.payload?.settings ?? {};
      const legacySecret = settings.secret ?? "";
      if (!globalSettings.pairingSecret && legacySecret) {
        globalSettings.pairingSecret = legacySecret;
        saveGlobalSettings();
      }
      document.querySelector("#secret").value = globalSettings.pairingSecret ?? legacySecret;
      if (actionUuid === SETTINGS_ACTION) {
        const status = document.querySelector("#status");
        status.textContent = globalSettings.pairingSecret ? "Global pairing secret saved" : "Enter your Foundry pairing secret";
        status.classList.toggle("connected", Boolean(globalSettings.pairingSecret));
      }
      requestCatalog();
      return;
    }
    if (message.event !== "sendToPropertyInspector" || message.payload?.event !== "catalog") return;
    renderCatalog(message.payload);
  };
};

function fillFromSettings() {
  document.querySelector("#secret").value = globalSettings.pairingSecret ?? settings.secret ?? "";
  document.querySelector("#uuid").value = settings.payload?.uuid ?? "";
  document.querySelector("#payload").value = JSON.stringify(settings.payload ?? {}, null, 2);
}

function requestCatalog() {
  if (actionUuid === SETTINGS_ACTION) return;
  websocket.send(JSON.stringify({
    event: "sendToPlugin", action: actionUuid, context: uuid,
    payload: { event: "requestCatalog", settings }
  }));
}

function renderCatalog(payload) {
  const status = document.querySelector("#status");
  status.textContent = payload.connected ? "Connected to Foundry" : "Waiting for Foundry…";
  status.classList.toggle("connected", payload.connected);

  const user = document.querySelector("#user");
  user.innerHTML = '<option value="">Automatic</option>' + payload.users.map((u) =>
    `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} — ${escapeHtml(u.world.title)}</option>`).join("");
  user.value = settings.userId ?? "";

  const action = document.querySelector("#action");
  const groups = new Map();
  for (const item of payload.catalog) {
    const group = item.group || "Foundry";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  action.innerHTML = [...groups.entries()].map(([group, items]) =>
    `<optgroup label="${escapeHtml(group)}">${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</optgroup>`
  ).join("");
  action.value = settings.actionId ?? action.value;
}

function save() {
  let payload;
  try { payload = JSON.parse(document.querySelector("#payload").value || "{}"); }
  catch { document.querySelector("#status").textContent = "Advanced payload is not valid JSON."; return; }
  const documentUuid = document.querySelector("#uuid").value.trim();
  if (documentUuid) payload.uuid = documentUuid;
  settings = {
    ...settings,
    userId: document.querySelector("#user").value,
    actionId: document.querySelector("#action").value || settings.actionId,
    payload
  };
  delete settings.secret;
  websocket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
}

function saveGlobalSettings() {
  websocket.send(JSON.stringify({ event: "setGlobalSettings", context: uuid, payload: globalSettings }));
}

document.querySelector("#secret").addEventListener("change", (event) => {
  globalSettings.pairingSecret = event.target.value;
  saveGlobalSettings();
  const status = document.querySelector("#status");
  status.textContent = event.target.value ? "Global pairing secret saved" : "Enter your Foundry pairing secret";
  status.classList.toggle("connected", Boolean(event.target.value));
  requestCatalog();
});
for (const element of document.querySelectorAll("select, textarea, #uuid")) element.addEventListener("change", save);
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value ?? ""); return node.innerHTML; }
