/**
 * Markdown for the CMS's preview, rendered in the browser and sanitised before it is inserted.
 *
 * Both libraries are imported dynamically, so they are in a chunk no candidate page ever loads
 * (M2 plan decision 7) — the preview costs nothing until someone opens the Preview tab.
 *
 * Sanitising is not a formality. A content expert's markdown is rendered in an admin's browser,
 * where a script tag would be a privilege escalation, and the same lesson bodies will one day be
 * rendered for candidates. Markdown allows raw HTML, so the output goes through DOMPurify.
 */
export async function renderMarkdown(source: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    import("marked"),
    import("dompurify"),
  ]);
  const html = await marked.parse(source, { gfm: true, breaks: false });
  return DOMPurify.sanitize(html);
}
