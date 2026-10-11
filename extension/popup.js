import { detectBrowser, loadState, profileEmail } from "./lib/agent.js";

/**
 * The popup: this profile's name and browser, the connections with their last report, adding one (address + key),
 * "Check now", and the discovery switch. The work itself runs in the service worker (background.js).
 */

const language = chrome.i18n.getUILanguage();
const t = (key, ...values) => chrome.i18n.getMessage(key, values.map(String)) || key;
const byId = (id) => document.getElementById(id);

const ERRORS = {
  address: "errorAddress",
  key: "errorKey",
  network: "errorNetwork",
  unauthorized: "errorUnauthorized",
  busy: "errorBusy",
  server: "errorServer",
  invalid: "errorInvalid",
  profile: "errorProfile",
};
const errorText = (code) => t(ERRORS[code] ?? "errorNetwork");

const ui = {
  check: byId("check"),
  profileForm: byId("profile"),
  name: byId("profile-name"),
  browser: byId("profile-browser"),
  email: byId("profile-email"),
  list: byId("connections"),
  add: byId("add"),
  connectForm: byId("connect"),
  address: byId("address"),
  key: byId("key"),
  connectError: byId("connect-error"),
  connectButton: byId("connect-button"),
  cancel: byId("cancel"),
  discover: byId("discover"),
};

let adding = false;
let email = null;

function relative(iso) {
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => ({ ok: false, error: "network" }));
}

function connectionCard(connection) {
  const item = element("li", "card");
  const head = element("div", "card-head");
  head.append(element("strong", "grow", connection.workspace || new URL(connection.address).host));
  if (connection.desktop) head.append(element("span", "badge", t("desktopBadge")));
  const remove = element("button", "icon", "×");
  remove.type = "button";
  remove.title = t("remove");
  remove.setAttribute("aria-label", t("remove"));
  remove.addEventListener("click", async () => {
    await send({ type: "remove", id: connection.id });
    void render();
  });
  head.append(remove);
  item.append(head);
  item.append(element("p", "meta", [connection.device, new URL(connection.address).host].filter(Boolean).join(" · ")));
  if (connection.error) {
    item.append(element("p", "error", errorText(connection.error)));
  } else if (connection.lastReportAt) {
    const result = connection.result ?? { confirmed: 0, findings: 0, review: 0 };
    item.append(element("p", "meta", `${t("lastReport", relative(connection.lastReportAt))} · ${t("resultSummary", result.confirmed, result.findings, result.review)}`));
  } else {
    item.append(element("p", "meta", t("never")));
  }
  return item;
}

async function render() {
  const state = await loadState();
  if (document.activeElement !== ui.name) ui.name.value = state.profile?.name ?? (email ? email.split("@")[0] : "Default");
  ui.browser.value = state.profile?.browser ?? detectBrowser();
  ui.email.textContent = email ? t("profileEmail", email) : t("profileNoEmail");
  ui.list.replaceChildren(...state.connections.map(connectionCard));
  const showForm = state.connections.length === 0 || adding;
  ui.connectForm.hidden = !showForm;
  ui.cancel.hidden = state.connections.length === 0;
  ui.add.hidden = showForm;
  ui.check.hidden = state.connections.length === 0;
  ui.discover.checked = Boolean(state.discover);
}

async function saveProfile() {
  const result = await send({ type: "profile", name: ui.name.value, browser: ui.browser.value });
  ui.name.setCustomValidity(result.ok ? "" : errorText(result.error));
}

ui.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveProfile();
});
ui.name.addEventListener("change", () => void saveProfile());
ui.browser.addEventListener("change", () => void saveProfile());

ui.add.addEventListener("click", () => {
  adding = true;
  void render().then(() => ui.address.focus());
});
ui.cancel.addEventListener("click", () => {
  adding = false;
  ui.connectError.hidden = true;
  void render();
});

ui.connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.connectError.hidden = true;
  ui.connectButton.disabled = true;
  ui.connectButton.textContent = t("connecting");
  await saveProfile();
  const result = await send({ type: "connect", address: ui.address.value, key: ui.key.value });
  ui.connectButton.disabled = false;
  ui.connectButton.textContent = t("connectButton");
  if (result.ok) {
    adding = false;
    ui.address.value = "";
    ui.key.value = "";
  } else {
    ui.connectError.textContent = errorText(result.error);
    ui.connectError.hidden = false;
  }
  void render();
});

ui.check.addEventListener("click", async () => {
  ui.check.disabled = true;
  ui.check.classList.add("busy");
  await send({ type: "check" });
  ui.check.disabled = false;
  ui.check.classList.remove("busy");
  void render();
});

ui.discover.addEventListener("change", () => void send({ type: "discover", value: ui.discover.checked }));

chrome.storage.onChanged.addListener(() => void render());

document.documentElement.lang = language;
for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
email = await profileEmail();
await render();
