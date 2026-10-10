import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/**
 * A small, safe Markdown renderer for assistant replies: paragraphs, headings, lists, tables, quotes, code, bold,
 * italic, links and device/account mentions. Everything is rendered as React text (never as HTML) and images are
 * not supported, so a reply cannot load remote content or smuggle data out through image URLs.
 */

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(@\[[^\]\n]{1,160}\]\((?:device|account):\d{1,12}\))|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Splits a message around its mentions (the mentions stay as their own parts). */
export const MENTION_SPLIT = /(@\[[^\]\n]{1,160}\]\((?:device|account):\d{1,12}\))/g;

export function parseMention(text: string): { title: string; kind: "device" | "account"; id: number } | null {
  const match = /^@\[(.+)\]\((device|account):(\d+)\)$/.exec(text);
  return match ? { title: match[1], kind: match[2] as "device" | "account", id: Number(match[3]) } : null;
}

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https?:\/\//i.test(href) ? href : null;
}

function LinkText({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  const className = "font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent";
  if (safe.startsWith("/")) {
    return (
      <Link href={safe} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className={cn(className, "break-all")}>
      {children}
    </a>
  );
}

export function MentionChip({ title, kind, id, inverted }: { title: string; kind?: "device" | "account"; id?: number; inverted?: boolean }) {
  const className = cn(
    "inline-flex max-w-full items-center rounded-md px-1.5 py-px align-baseline text-[0.92em] font-semibold",
    inverted ? "bg-on-primary/20 text-on-primary" : "bg-accent-soft text-accent ring-1 ring-inset ring-accent-line",
  );
  if (kind && id && !inverted) {
    return (
      <Link href={kind === "device" ? `/app/devices/${id}` : `/app/accounts/${id}`} className={cn(className, "hover:bg-accent-line/40")}>
        @{title}
      </Link>
    );
  }
  return <span className={className}>@{title}</span>;
}

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.88em] text-ink">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (match[3]) {
      const mention = parseMention(token);
      nodes.push(<MentionChip key={key} title={mention?.title ?? token} kind={mention?.kind} id={mention?.id} />);
    } else if (match[4]) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      nodes.push(
        <LinkText key={key} href={link?.[2] ?? ""}>
          {renderInline(link?.[1] ?? token, key)}
        </LinkText>,
      );
    } else if (match[5]) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      nodes.push(
        <LinkText key={key} href={token}>
          {token}
        </LinkText>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; lines: string[] }
  | { kind: "paragraph"; lines: string[] };

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) body.push(lines[index++]);
      index += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      const header = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (index < lines.length && bullet.test(lines[index])) items.push(lines[index++].replace(bullet, ""));
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) quoted.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !bullet.test(lines[index]) && !/^#{1,4}\s/.test(lines[index]) && !lines[index].trim().startsWith("```")) {
      paragraph.push(lines[index++]);
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

function withBreaks(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, position) => [...(position > 0 ? [<br key={`${key}-br-${position}`} />] : []), ...renderInline(line, `${key}-${position}`)]);
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2.5 text-[14.5px] leading-relaxed text-ink", className)}>
      {parseBlocks(text).map((block, position) => {
        const key = `b${position}`;
        switch (block.kind) {
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-xl bg-sunken px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
                {block.text}
              </pre>
            );
          case "heading":
            return (
              <p key={key} className={cn("font-semibold text-ink", block.level <= 2 ? "text-base" : "text-[15px]")}>
                {renderInline(block.text, key)}
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc marker:text-faint")}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-max text-left text-[13px]">
                  <thead className="bg-subtle text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} className="px-3 py-2">
                          {renderInline(cell, `${key}-h${cellIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-line">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2 align-top">
                            {renderInline(cell, `${key}-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quote":
            return (
              <blockquote key={key} className="rounded-xl bg-subtle px-4 py-2.5 text-ink-2">
                {withBreaks(block.lines, key)}
              </blockquote>
            );
          default:
            return <p key={key}>{withBreaks(block.lines, key)}</p>;
        }
      })}
    </div>
  );
}
