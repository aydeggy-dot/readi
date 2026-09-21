"use client";

import type { ContentEntityPath } from "@readi/shared-types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDay, t } from "@/i18n";
import { browserApi } from "@/lib/browser-api";

/**
 * What this item used to say (ADR-0014 decision 2). A version is kept only when the content
 * actually changed, so this list is the real edit history rather than a log of saves.
 *
 * It loads after the page, and one snapshot at a time: history is the least urgent thing on an
 * editor's screen and the heaviest to send.
 */
export function VersionHistory({ entity, id }: { entity: ContentEntityPath; id: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["content-versions", entity, id],
    queryFn: async () => {
      const { data } = await browserApi.GET("/api/admin/content/{entity}/{id}/versions", {
        params: { path: { entity, id } },
      });
      if (!data) throw new Error("versions");
      return data.versions;
    },
  });

  return (
    <section className="flex flex-col gap-3 border-t border-frame pt-6">
      <h2 className="text-xl leading-tight">{t("admin.content.versions.title")}</h2>
      <p className="text-base text-muted-foreground">{t("admin.content.versions.lead")}</p>
      {isPending && <p className="text-base text-muted-foreground">{t("common.loading")}</p>}
      {isError && (
        <p className="text-base text-destructive">{t("admin.content.versions.failed")}</p>
      )}
      {data && data.length === 0 && (
        <p className="text-base text-muted-foreground">{t("admin.content.versions.none")}</p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((version) => (
            <VersionEntry
              key={version.version}
              entity={entity}
              id={id}
              version={version.version}
              note={version.change_note}
              createdAt={version.created_at}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function VersionEntry({
  entity,
  id,
  version,
  note,
  createdAt,
}: {
  entity: ContentEntityPath;
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ["content-version", entity, id, version],
    enabled: open,
    queryFn: async () => {
      const { data } = await browserApi.GET("/api/admin/content/{entity}/{id}/versions/{version}", {
        params: { path: { entity, id, version } },
      });
      if (!data) throw new Error("version");
      return data.snapshot;
    },
  });

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold text-heading">
          {t("admin.content.versions.entry", { version })}
        </span>
        <span className="text-base text-muted-foreground">{formatDay(createdAt)}</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? t("admin.content.versions.hide") : t("admin.content.versions.show")}
        </Button>
      </div>
      <p className="text-base text-muted-foreground">
        {note
          ? t("admin.content.versions.changeNote", { note })
          : t("admin.content.versions.noNote")}
      </p>
      {open && (
        <>
          {isPending && <p className="text-base text-muted-foreground">{t("common.loading")}</p>}
          {isError && (
            <p className="text-base text-destructive">{t("admin.content.versions.failed")}</p>
          )}
          {data && <Snapshot snapshot={data} />}
        </>
      )}
    </li>
  );
}

/**
 * The stored snapshot, field by field. Its shape follows the entity it belongs to, and it is a
 * record of what was, so it is rendered generically rather than pretended into a form.
 */
function Snapshot({ snapshot }: { snapshot: Record<string, unknown> }) {
  return (
    <dl className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-base">
      {Object.entries(snapshot).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="font-bold text-heading">{key}</dt>
          <dd className="break-words whitespace-pre-wrap">
            {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : JSON.stringify(value, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
