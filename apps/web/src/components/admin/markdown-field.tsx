"use client";

import { useEffect, useId, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";

/**
 * A markdown field with a preview beside it — the one place in the CMS where what you type is not
 * what a candidate sees. Write and Preview are two tabs rather than a split view, because at 360px
 * there is only room for one.
 *
 * The renderer is loaded when Preview is first opened and never before, so the markdown libraries
 * stay out of the page's first load (M2 plan decision 7).
 */
export function MarkdownField({
  id,
  label,
  hint,
  error,
  value,
  rows = 8,
  maxLength,
  textareaProps,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** The current text, watched by the form, so the preview follows what is typed. */
  value: string;
  rows?: number;
  maxLength: number;
  textareaProps: UseFormRegisterReturn;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const panelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label={label} className="flex gap-1 self-end">
        <Tab current={tab} value="write" panelId={panelId} onSelect={setTab}>
          {t("admin.content.markdown.write")}
        </Tab>
        <Tab current={tab} value="preview" panelId={panelId} onSelect={setTab}>
          {t("admin.content.markdown.preview")}
        </Tab>
      </div>
      {/* The textarea stays mounted: unmounting it would lose the cursor and the undo history. */}
      <div className={cn(tab === "preview" && "hidden")}>
        <Field id={id} label={label} hint={hint ?? t("admin.content.markdown.hint")} error={error}>
          {(describedBy) => (
            <Textarea
              id={id}
              rows={rows}
              maxLength={maxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              {...textareaProps}
            />
          )}
        </Field>
      </div>
      {tab === "preview" && <Preview id={panelId} source={value} />}
    </div>
  );
}

function Tab({
  current,
  value,
  panelId,
  onSelect,
  children,
}: {
  current: "write" | "preview";
  value: "write" | "preview";
  panelId: string;
  onSelect: (tab: "write" | "preview") => void;
  children: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-sm px-2 py-1 text-base font-bold underline-offset-8",
        selected ? "text-heading underline decoration-pen decoration-2" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Preview({ id, source }: { id: string; source: string }) {
  const markdown = source.trim();
  const [html, setHtml] = useState<string | null>(null);

  // The renderer is asynchronous because it is loaded on demand. Nothing to render is decided
  // while rendering, not in the effect, and the last preview stays up while the next one is built.
  useEffect(() => {
    if (!markdown) return;
    let current = true;
    void renderMarkdown(markdown).then((rendered) => {
      if (current) setHtml(rendered);
    });
    return () => {
      current = false;
    };
  }, [markdown]);

  if (!markdown) {
    return (
      <p id={id} role="tabpanel" className="text-base text-muted-foreground">
        {t("admin.content.markdown.empty")}
      </p>
    );
  }
  if (html === null) {
    return (
      <p id={id} role="tabpanel" className="text-base text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  }
  return (
    <div
      id={id}
      role="tabpanel"
      data-testid="markdown-preview"
      className={cn(
        "rounded-md border border-border bg-card p-4",
        "[&_h1]:mb-2 [&_h1]:text-2xl [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h3]:mt-3 [&_h3]:font-bold",
        "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:mb-1 [&_a]:underline [&_a]:decoration-pen [&_a]:decoration-2",
        "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_pre]:mb-3 [&_pre]:overflow-x-auto",
        "[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_blockquote]:border-l-2",
        "[&_blockquote]:border-frame [&_blockquote]:pl-4 [&_*:last-child]:mb-0",
      )}
      // Sanitised by DOMPurify in renderMarkdown; see the note there.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
