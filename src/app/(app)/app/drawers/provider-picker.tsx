"use client";

import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { newProviderColor } from "@/modules/accounts/colors";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { Input } from "@/shared/ui/form-controls";
import type { ProviderItem } from "../map-types";
import { ProviderAvatar } from "../ui";

/** What the picker holds: a listed provider, or the name of a new one, made when the form is saved. */
export type ProviderChoice = { providerId: number | null; newName: string | null };

type Option = { kind: "provider"; provider: ProviderItem } | { kind: "add" };

/** A listed provider with exactly this name (any case), if there is one. */
export function providerNamed(providers: ProviderItem[], name: string): ProviderItem | undefined {
  const wanted = name.trim().toLowerCase();
  return providers.find((provider) => provider.name.toLowerCase() === wanted);
}

/**
 * The provider id to save with: the chosen one, a listed one with the new name, or a new provider made now. Throws the
 * API's error when the new one is refused (its message belongs under the new name field).
 */
export async function providerForSave(choice: ProviderChoice, providers: ProviderItem[]): Promise<number | null> {
  if (choice.newName === null) return choice.providerId;
  const listed = providerNamed(providers, choice.newName);
  if (listed) return listed.id;
  const name = choice.newName.trim();
  const created = await api<{ id: number }>("/api/providers", { method: "POST", body: { name, color: newProviderColor(name) } });
  return created.data.id;
}

/**
 * A searchable list of providers (logo and name) with "Add a provider" at the bottom. Choosing it shows a field for
 * the new provider's name under the picker; the form makes the provider when it is saved (providerForSave).
 */
export function ProviderPicker({
  id,
  providers,
  value,
  onChange,
  invalid,
  newNameError,
}: {
  id: string;
  providers: ProviderItem[];
  value: ProviderChoice;
  onChange: (choice: ProviderChoice) => void;
  invalid?: boolean;
  newNameError?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;

  const needle = query.trim().toLowerCase();
  const matches = needle ? providers.filter((provider) => provider.name.toLowerCase().includes(needle) || (provider.domain ?? "").includes(needle)) : providers;
  const exact = needle ? providerNamed(providers, needle) : undefined;
  const options: Option[] = [...matches.map((provider) => ({ kind: "provider" as const, provider })), ...(exact ? [] : [{ kind: "add" as const }])];
  const selected = providers.find((provider) => provider.id === value.providerId) ?? null;
  const adding = value.newName !== null;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  const openList = () => {
    setQuery("");
    setActive(Math.max(0, providers.findIndex((provider) => provider.id === value.providerId)));
    setOpen(true);
  };

  const choose = (option: Option | undefined) => {
    if (!option) return;
    setOpen(false);
    if (option.kind === "provider") {
      onChange({ providerId: option.provider.id, newName: null });
      trigger.current?.focus();
    } else {
      // The name field below takes the focus (autoFocus) with what was typed so far.
      onChange({ providerId: null, newName: query.trim() });
    }
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.min(Math.max(current + step, 0), options.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      // Closes the list only, not the drawer around it (which listens on the document).
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openList();
          }
        }}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft",
          invalid ? "border-danger focus:border-danger focus:ring-danger-soft" : "border-line",
        )}
      >
        {selected ? (
          <>
            <ProviderAvatar provider={selected} size="sm" />
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          </>
        ) : adding ? (
          <>
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Plus className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{t("accounts.providerNew")}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-faint">{t("accounts.chooseProvider")}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-float animate-pop">
          <div className="relative border-b border-line">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options.length > 0 ? optionId(Math.min(active, options.length - 1)) : undefined}
              aria-autocomplete="list"
              aria-label={t("accounts.providerSearch")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={t("accounts.providerSearch")}
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>
          {matches.length === 0 && needle ? <p className="px-3 pt-2 text-xs text-muted">{t("accounts.providerNoMatch")}</p> : null}
          <ul id={listId} role="listbox" aria-label={t("accounts.fieldProvider")} className="max-h-64 overflow-y-auto p-1">
            {options.map((option, index) =>
              option.kind === "provider" ? (
                <li
                  key={option.provider.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.provider.id === value.providerId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-ink", index === active && "bg-subtle")}
                >
                  <ProviderAvatar provider={option.provider} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{option.provider.name}</span>
                  {option.provider.domain ? <span className="hidden truncate text-xs text-faint sm:inline">{option.provider.domain}</span> : null}
                  {option.provider.id === value.providerId ? <Check className="size-4 shrink-0 text-accent" /> : null}
                </li>
              ) : (
                <li
                  key="add"
                  id={optionId(index)}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border-t border-line px-2.5 py-2 text-sm font-semibold text-accent",
                    index === active && "bg-accent-soft",
                  )}
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-md bg-accent-soft">
                    <Plus className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{needle ? t("accounts.providerAddNamed", { name: query.trim() }) : t("accounts.providerAdd")}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      {adding ? (
        <div className="mt-2 space-y-1.5">
          <label htmlFor={`${id}-new`} className="text-xs font-semibold text-ink-2">
            {t("accounts.providerNewName")}
          </label>
          <Input
            id={`${id}-new`}
            autoFocus
            value={value.newName ?? ""}
            maxLength={60}
            onChange={(event) => onChange({ providerId: null, newName: event.target.value })}
            invalid={Boolean(newNameError)}
            placeholder={t("accounts.providerNewPlaceholder")}
          />
          {newNameError ? (
            <p role="alert" className="text-xs text-danger-ink">
              {newNameError}
            </p>
          ) : (
            <p className="text-xs text-muted">{t("accounts.providerNewHint")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
