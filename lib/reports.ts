import { must, query } from "./db";
export async function reportDownload(
  uid: string,
  kind: "task" | "chat",
  rid: string,
) {
  let title = "",
    body = "";
  if (kind === "task") {
    const [t] = await query(
      "SELECT title,result FROM tasks WHERE id=$1 AND user_id=$2 AND state='COMPLETED'",
      [rid, uid],
    );
    must(t, "Completed report unavailable.", 404);
    title = t.title;
    body = t.result?.text || JSON.stringify(t.result, null, 2);
    const sources = t.result?.sources || [];
    if (sources.length)
      body +=
        "\n\n## Sources\n\n" +
        sources
          .map((s: any, i: number) => i + 1 + ". " + s.title + " — " + s.url)
          .join("\n");
    if (t.result?.url) body += "\n\nSource: " + t.result.url;
  } else {
    const [c] = await query(
      "SELECT title FROM conversations WHERE id=$1 AND user_id=$2",
      [rid, uid],
    );
    must(c, "Conversation unavailable.", 404);
    const rows = await query(
      "SELECT role,body FROM messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at,seq",
      [rid, uid],
    );
    title = c.title;
    body = rows
      .map(
        (m) =>
          "## " +
          (m.role === "user" ? "Operator" : "S.C.A.R.L.E.T.") +
          "\n\n" +
          m.body,
      )
      .join("\n\n");
  }
  return new Response(
    "# " + title.replace(/[\r\n]+/g, " ") + "\n\n" + body + "\n",
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="scarlet-' +
          kind +
          "-" +
          rid.replace(/[^a-z0-9-]/gi, "").slice(0, 45) +
          '.md"',
        "Cache-Control": "no-store",
      },
    },
  );
}
