/**
 * Which sites this browser profile is signed in to, read from the profile's cookies: their names, and for a few
 * sites the account name a cookie or the site itself states. Only a site's domain and that account name ever leave
 * the browser; cookie values, passwords and page content never do.
 */

/** Second-level labels under a country code ("co.id", "com.au"), to find a site's own domain. */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "ac", "go", "or", "my", "web", "sch", "gov", "edu"]);

/** A cookie name that says the visitor signed in, for sites without their own rule. */
const SIGNED_IN_COOKIE =
  /(^|[_.-])(auth|authorization|auth[_-]?token|access[_-]?token|id[_-]?token|refresh[_-]?token|logged[_-]?in|remember[_-]?(me|web|token)?|session[_-]?token|jwt|sso)([_.-]|$)/i;
const EMPTY_VALUES = new Set(["", "0", "false", "no", "null", "deleted", "-"]);

/** Sites found by discovery at most, per report (the server takes 300 sessions). */
const MAX_DISCOVERED = 100;
const MAX_SESSIONS = 300;

const has = (cookies, name) => cookies.some((cookie) => cookie.name === name && !EMPTY_VALUES.has(cookie.value));
const valueOf = (cookies, name) => cookies.find((cookie) => cookie.name === name)?.value ?? null;

/** Every Google account signed in to this profile, as Chrome itself lists them. */
async function googleAccounts() {
  try {
    const response = await fetch("https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard", {
      credentials: "include",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = JSON.parse((await response.text()).replace(/^\)\]\}'\s*/, ""));
    const entries = Array.isArray(data?.[1]) ? data[1] : [];
    // [3] is the email, [5] 0 when the session is no longer valid, [14] 1 when signed out.
    return entries
      .filter((entry) => Array.isArray(entry) && typeof entry[3] === "string" && entry[3].includes("@") && entry[5] !== 0 && entry[14] !== 1)
      .map((entry) => entry[3].toLowerCase());
  } catch {
    return [];
  }
}

/** GitHub keeps the signed-in user name in a cookie of its own. */
async function githubAccount(cookies) {
  const login = valueOf(cookies, "dotcom_user");
  return login ? [decodeURIComponent(login)] : [];
}

/**
 * Sites with a known sign-in cookie. `urls` adds the cookies of the pages a site signs in on; `accounts` reads the
 * account names when the site states them. A site with a rule is "checked": a recorded sign-in there that is not seen
 * is marked for a check in AkunMu (never signed out).
 */
const RULES = [
  { domain: "google.com", signedIn: (c) => has(c, "SID") || has(c, "__Secure-1PSID"), accounts: googleAccounts },
  { domain: "github.com", signedIn: (c) => valueOf(c, "logged_in") === "yes", accounts: githubAccount },
  { domain: "gitlab.com", signedIn: (c) => has(c, "known_sign_in") },
  {
    domain: "microsoft.com",
    urls: ["https://login.live.com/", "https://login.microsoftonline.com/"],
    signedIn: (c) => has(c, "MSPAuth") || has(c, "__Host-MSAAUTH") || has(c, "ESTSAUTHPERSISTENT"),
  },
  { domain: "apple.com", signedIn: (c) => has(c, "myacinfo") },
  { domain: "facebook.com", signedIn: (c) => has(c, "c_user") },
  { domain: "instagram.com", signedIn: (c) => has(c, "sessionid") && has(c, "ds_user_id") },
  { domain: "x.com", signedIn: (c) => has(c, "auth_token") },
  { domain: "twitter.com", signedIn: (c) => has(c, "auth_token") },
  { domain: "linkedin.com", signedIn: (c) => has(c, "li_at") },
  { domain: "slack.com", signedIn: (c) => has(c, "d") },
  { domain: "notion.so", signedIn: (c) => has(c, "token_v2") },
  { domain: "claude.ai", signedIn: (c) => has(c, "sessionKey") },
  { domain: "chatgpt.com", signedIn: (c) => has(c, "__Secure-next-auth.session-token") },
  { domain: "netflix.com", signedIn: (c) => has(c, "NetflixId") },
  { domain: "spotify.com", signedIn: (c) => has(c, "sp_dc") },
  { domain: "aws.amazon.com", signedIn: (c) => has(c, "aws-userInfo") },
];

function ruleFor(domain) {
  return RULES.find((rule) => domain === rule.domain || domain.endsWith(`.${rule.domain}`));
}

/** A site's own domain: "mail.google.com" → "google.com", "seller.shopee.co.id" → "shopee.co.id". */
export function siteOf(host) {
  const labels = host.replace(/^\./, "").toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return null;
  const last = labels[labels.length - 1];
  const keep = last.length === 2 && labels.length > 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

function signedInCookie(cookie) {
  return SIGNED_IN_COOKIE.test(cookie.name) && !EMPTY_VALUES.has(cookie.value);
}

/** The cookies of a site and its subdomains, plus those it receives from its parent domain and sign-in pages. */
async function cookiesFor(domain, urls = []) {
  const lists = await Promise.all([
    chrome.cookies.getAll({ domain }),
    chrome.cookies.getAll({ url: `https://${domain}/` }),
    ...urls.map((url) => chrome.cookies.getAll({ url })),
  ]);
  const unique = new Map();
  for (const cookie of lists.flat()) unique.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
  return [...unique.values()];
}

/**
 * Looks at the workspace's sites (its providers' domains) and, when `discover` is on, every other site whose cookies
 * say the visitor signed in. Returns the sessions found and the sites looked at with a reliable rule.
 */
export async function sweep(sites, { discover = false } = {}) {
  const sessions = [];
  const checked = [];
  const covered = new Set();
  for (const site of sites) {
    const domain = site.domain.toLowerCase();
    const rule = ruleFor(domain);
    const cookies = await cookiesFor(domain, rule?.urls);
    const own = siteOf(domain);
    if (own) covered.add(own);
    if (rule) {
      checked.push(domain);
      if (!rule.signedIn(cookies)) continue;
      const accounts = rule.accounts ? await rule.accounts(cookies) : [];
      if (accounts.length === 0) sessions.push({ domain, identifier: null });
      for (const identifier of accounts) sessions.push({ domain, identifier });
    } else if (cookies.some(signedInCookie)) {
      sessions.push({ domain, identifier: null });
    }
  }
  if (discover) {
    const found = new Set();
    for (const cookie of await chrome.cookies.getAll({})) {
      if (!signedInCookie(cookie)) continue;
      const own = siteOf(cookie.domain);
      if (own && !covered.has(own)) found.add(own);
    }
    for (const domain of [...found].sort().slice(0, MAX_DISCOVERED)) sessions.push({ domain, identifier: null });
  }
  return { sessions: sessions.slice(0, MAX_SESSIONS), checked: checked.slice(0, 400) };
}
