import { AgentError, connect, disconnect, loadState, reportAll, saveProfile, setDiscover } from "./lib/agent.js";

/**
 * The extension's service worker: reports every 6 hours and when the browser starts (if the last report is old),
 * and does what the panel asks (connect, check now, remove, settings), so the work goes on after the panel closes.
 */

const ALARM = "report";
const EVERY_MINUTES = 6 * 60;

/**
 * The toolbar button opens AkunMu in the browser's side panel, which stays open while the owner copies an address or
 * a key from another tab; a browser without a side panel gets the same page as a popup.
 */
async function configureButton() {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.action.setPopup({ popup: "" });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    await chrome.action.setPopup({ popup: "panel.html?popup" });
  }
}

void configureButton().catch(() => undefined);

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: EVERY_MINUTES });
}

/** On browser start: reports when no connection has reported for a whole period (alarms may not survive a restart). */
async function reportIfStale() {
  const { connections } = await loadState();
  const last = Math.max(0, ...connections.map((connection) => (connection.lastReportAt ? Date.parse(connection.lastReportAt) : 0)));
  if (connections.length > 0 && Date.now() - last > EVERY_MINUTES * 60_000) await reportAll();
}

chrome.runtime.onInstalled.addListener(() => void ensureAlarm());
chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  void reportIfStale();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void reportAll();
});

const ACTIONS = {
  connect: (message) => connect(message),
  check: () => reportAll(),
  remove: (message) => disconnect(message.id),
  profile: (message) => saveProfile(message),
  discover: (message) => setDiscover(message.value),
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const action = sender.id === chrome.runtime.id ? ACTIONS[message?.type] : undefined;
  if (!action) return false;
  action(message)
    .then(() => respond({ ok: true }))
    .catch((error) => respond({ ok: false, error: error instanceof AgentError ? error.code : "network" }));
  // The answer comes after the work is done.
  return true;
});
