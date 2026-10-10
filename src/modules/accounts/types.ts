/** Provider and account types shared by the server and the browser (no database imports). */

/** Whether the account has two-step verification, as far as the owner knows. */
export const TWO_FACTOR_STATES = ["on", "off", "unknown"] as const;
export type TwoFactorState = (typeof TWO_FACTOR_STATES)[number];

export type BuiltInProvider = { slug: string; name: string; domain: string; color: string };

/** Providers every workspace starts with; more can be added. Colors are each brand's own. */
export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  { slug: "google", name: "Google", domain: "google.com", color: "#4285F4" },
  { slug: "microsoft", name: "Microsoft", domain: "microsoft.com", color: "#0078D4" },
  { slug: "apple", name: "Apple", domain: "apple.com", color: "#1F2937" },
  { slug: "github", name: "GitHub", domain: "github.com", color: "#24292F" },
  { slug: "gitlab", name: "GitLab", domain: "gitlab.com", color: "#FC6D26" },
  { slug: "facebook", name: "Facebook", domain: "facebook.com", color: "#1877F2" },
  { slug: "instagram", name: "Instagram", domain: "instagram.com", color: "#E4405F" },
  { slug: "x", name: "X", domain: "x.com", color: "#111111" },
  { slug: "linkedin", name: "LinkedIn", domain: "linkedin.com", color: "#0A66C2" },
  { slug: "whatsapp", name: "WhatsApp", domain: "whatsapp.com", color: "#25D366" },
  { slug: "telegram", name: "Telegram", domain: "telegram.org", color: "#26A5E4" },
  { slug: "discord", name: "Discord", domain: "discord.com", color: "#5865F2" },
  { slug: "slack", name: "Slack", domain: "slack.com", color: "#4A154B" },
  { slug: "zoom", name: "Zoom", domain: "zoom.us", color: "#2D8CFF" },
  { slug: "notion", name: "Notion", domain: "notion.so", color: "#111111" },
  { slug: "figma", name: "Figma", domain: "figma.com", color: "#F24E1E" },
  { slug: "canva", name: "Canva", domain: "canva.com", color: "#00C4CC" },
  { slug: "claude", name: "Claude", domain: "claude.ai", color: "#D97757" },
  { slug: "chatgpt", name: "ChatGPT", domain: "chatgpt.com", color: "#10A37F" },
  { slug: "vercel", name: "Vercel", domain: "vercel.com", color: "#111111" },
  { slug: "cloudflare", name: "Cloudflare", domain: "cloudflare.com", color: "#F38020" },
  { slug: "aws", name: "AWS", domain: "aws.amazon.com", color: "#FF9900" },
  { slug: "tokopedia", name: "Tokopedia", domain: "tokopedia.com", color: "#03AC0E" },
  { slug: "shopee", name: "Shopee", domain: "shopee.co.id", color: "#EE4D2D" },
  { slug: "netflix", name: "Netflix", domain: "netflix.com", color: "#E50914" },
  { slug: "spotify", name: "Spotify", domain: "spotify.com", color: "#1DB954" },
];
