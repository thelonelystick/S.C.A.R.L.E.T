"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  FolderOpen,
  Globe2,
  Layers,
  ListChecks,
  LoaderCircle,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import "./workspace.css";

type Memory = {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  expires?: string;
};
type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
  body?: string;
};
type ActivityEntry = {
  id: string;
  title: string;
  detail?: string;
  kind: string;
  created_at: string;
};
type Target = {
  to?: string;
  body?: string;
  subject?: string;
  title?: string;
  start?: string;
  end?: string;
  query?: string;
  url?: string;
};
type Result = {
  title?: string;
  text?: string;
  url?: string;
  screenshot?: string;
  links?: { label: string; url: string }[];
  sources?: { title: string; description: string; url: string }[];
  delivery?: unknown;
  event?: unknown;
};
type Task = {
  id: string;
  title: string;
  kind: string;
  state: string;
  revision: string;
  payload: Target;
  result?: Result;
  run_at: string;
  updated_at: string;
  created_at: string;
  error?: string;
  steps?: { created_at: string; body: string }[];
};
type Data = {
  user: { settings: { memory?: boolean; retention?: number } };
  memories: Memory[];
  tasks: Task[];
  files: StoredFile[];
  activities: ActivityEntry[];
  notifications: { id: string; body: string; created_at: string }[];
  connections: { kind: string }[];
  capabilities: { browser: boolean; documentEmbeddings?: boolean };
};
type Props = {
  page: string;
  data: Data;
  act: (path: string, payload?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
};
type SectionProps = Omit<Props, "page">;
const tags = [
  "Saved fact",
  "Preference",
  "Project",
  "Personal context",
  "Conversation summary",
  "Task history",
];
const types: Record<string, string> = {
  browser: "Source inspection",
  research: "Source report",
  reminder: "Reminder",
  task: "Task",
  "email.send": "Send email",
  "whatsapp.send": "Send WhatsApp message",
  "calendar.publish": "Publish event",
};
const date = (s: string | undefined) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
const time = (s: string) =>
  new Date(s).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
const readable = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (ch) => ch.toUpperCase());
const size = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MiB`
    : n >= 1024
      ? `${Math.ceil(n / 1024)} KiB`
      : `${n} B`;
const openStates = ["QUEUED", "PLANNING", "RUNNING", "WAITING_FOR_APPROVAL"];
function secureHref(value?: string) {
  try {
    const u = new URL(value || "");
    return ["https:", "http:"].includes(u.protocol) &&
      !u.password &&
      !u.username
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
function linkId() {
  return typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("task") || "";
}
function msg(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request failed. Try again.";
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/${path}`, { cache: "no-store", signal });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError("") };
}
function ErrorNote({ text }: { text: string }) {
  return text ? (
    <p className="wp-error" role="alert">
      <CircleAlert size={16} />
      {text}
    </p>
  ) : null;
}
function Panel({
  title,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  icon: LucideIcon;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="wp-panel">
      <header className="wp-head">
        <h2>
          <Icon size={18} />
          {title}
        </h2>
        {aside}
      </header>
      <div className="wp-content">{children}</div>
    </section>
  );
}
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="wp-empty">
      <span>
        <Icon size={23} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
function Badge({ state }: { state: string }) {
  return (
    <span className={`wp-badge wp-${state.toLowerCase()}`}>
      {readable(state)}
    </span>
  );
}
function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  label: string;
}) {
  return (
    <label className="wp-search">
      <Search size={16} />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function SectionCount({ n }: { n: number }) {
  return <span className="wp-count">{n}</span>;
}

function Memories({ data, act }: SectionProps) {
  const [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(""),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState(tags[0]),
    [body, setBody] = useState(""),
    [remove, setRemove] = useState("");
  const operation = useAction();
  const enabled = data.user.settings.memory !== false;
  const edit = (m?: Memory) => {
    operation.clear();
    setSelected(m?.id || "");
    setTitle(m?.title || "");
    setCategory(m?.category || tags[0]);
    setBody(m?.body || "");
    setRemove("");
  };
  const filtered = data.memories.filter((m) =>
    `${m.title} ${m.body} ${m.category}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <div className="wp-grid">
      <Panel
        title="Memory library"
        icon={Database}
        aside={
          <a
            className="wp-link"
            href="/api/memory/export"
            download="scarlet-memories.json"
          >
            <Download size={15} />
            Export JSON
          </a>
        }
      >
        <SearchBox
          value={filter}
          onChange={setFilter}
          label="Search saved memories"
        />
        <div className="wp-stack">
          {filtered.map((m) => (
            <div
              className={"wp-record " + (m.id === selected ? "wp-chosen" : "")}
              key={m.id}
            >
              <div className="wp-row">
                <span className="wp-tag">{m.category}</span>
                <div className="wp-actions">
                  <button
                    type="button"
                    className="wp-icon"
                    aria-label={"Edit " + m.title}
                    onClick={() => edit(m)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="wp-icon"
                    aria-label={"Delete " + m.title}
                    onClick={() => setRemove(m.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3>{m.title}</h3>
              <p className="wp-pre">{m.body}</p>
              <small>
                {m.expires
                  ? "Expires " + date(m.expires)
                  : "Saved " + date(m.created_at)}
              </small>
              {remove === m.id && (
                <div className="wp-confirm">
                  <span>Delete this memory?</span>
                  <button
                    className="wp-btn"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(async () => {
                        await act("delete", { kind: "memory", id: m.id });
                        if (selected === m.id) edit();
                        setRemove("");
                      })
                    }
                  >
                    Delete
                  </button>
                  <button className="wp-sub" onClick={() => setRemove("")}>
                    Keep
                  </button>
                </div>
              )}
            </div>
          ))}
          {!filtered.length && (
            <Empty
              icon={Database}
              title={
                filter ? "No matching memories" : "Your memory library is empty"
              }
            >
              {filter
                ? "Try a different keyword."
                : "Save a preference, project detail, or fact for future conversations."}
            </Empty>
          )}
        </div>
      </Panel>
      <Panel
        title={selected ? "Edit memory" : "New memory"}
        icon={selected ? Pencil : Plus}
        aside={
          selected ? (
            <button className="wp-link" onClick={() => edit()}>
              <X size={14} />
              Cancel edit
            </button>
          ) : undefined
        }
      >
        {!enabled && (
          <p className="wp-note">
            Memory is paused.{" "}
            <Link href="/settings">Enable memory in Settings</Link> to save an
            entry.
          </p>
        )}
        <form
          className="wp-form"
          onSubmit={(e) => {
            e.preventDefault();
            void operation.run(async () => {
              await act("memory", {
                title,
                category,
                body,
                ...(selected ? { id: selected } : {}),
              });
              edit();
            });
          }}
        >
          <label>
            Title
            <input
              maxLength={100}
              required
              placeholder="e.g. Morning meeting preference"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Array.from(new Set([...tags, category])).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Memory
            <textarea
              rows={5}
              required
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What should S.C.A.R.L.E.T. remember?"
            />
          </label>
          <button className="wp-primary" disabled={!enabled || operation.busy}>
            <Save size={16} />
            Save memory
          </button>
          <ErrorNote text={operation.error} />
        </form>
      </Panel>
    </div>
  );
}

type PassageMatch = {
  documentId: string;
  name: string;
  part: number;
  body: string;
};
function Files({ data, act, refresh }: SectionProps) {
  const [searchMode, setSearchMode] = useState<"files" | "passages">("files"),
    [matches, setMatches] = useState<PassageMatch[] | null>(null),
    [focused, setFocused] = useState<PassageMatch | null>(null);
  const searchAction = useAction(),
    searchGeneration = useRef(0);
  const searchContents = (e: FormEvent) => {
    e.preventDefault();
    const generation = ++searchGeneration.current;
    void searchAction.run(async () => {
      const found = await get<PassageMatch[]>(
        "files/search?q=" + encodeURIComponent(search.trim()),
      );
      if (generation === searchGeneration.current) setMatches(found);
    });
  };
  const [selected, setSelected] = useState(""),
    [doc, setDoc] = useState<StoredFile | null>(null),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<{ fileId: string; text: string } | null>(
      null,
    ),
    [loadError, setLoadError] = useState(""),
    [search, setSearch] = useState(""),
    [deleting, setDeleting] = useState(false),
    [drag, setDrag] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    operation = useAction();
  const fileId = selected || data.files[0]?.id || "";
  const meta =
    data.files.find((f) => f.id === fileId) ||
    (doc?.id === fileId ? doc : undefined);
  const model = data.connections.some((c) => c.kind === "model");
  useEffect(() => {
    setDoc(null);
    setQuestion("");
    setAnswer(null);
    setLoadError("");
    setDeleting(false);
    if (!fileId) return;
    const c = new AbortController();
    get<StoredFile>("files/" + encodeURIComponent(fileId), c.signal)
      .then(setDoc)
      .catch((e) => {
        if (!c.signal.aborted) setLoadError(msg(e));
      });
    return () => c.abort();
  }, [fileId]);
  const upload = (file?: File) => {
    if (!file) return;
    void operation.run(async () => {
      if (!file.size || file.size > 5 * 1024 * 1024)
        throw new Error("Choose a nonempty file up to 5 MiB.");
      const r = await fetch("/api/files/upload", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed.");
      await refresh();
      setSelected(j.id);
    });
  };
  const ask = (e: FormEvent) => {
    e.preventDefault();
    void operation.run(async () => {
      const r = await act("command", {
        documentId: fileId,
        text: question.trim(),
      });
      if (r.intent === "error") throw new Error(r.text);
      setAnswer({ fileId, text: r.text });
    });
  };
  const filtered = data.files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="wp-grid">
      <Panel
        title="File library"
        icon={FolderOpen}
        aside={<SectionCount n={data.files.length} />}
      >
        <input
          ref={picker}
          className="wp-hidden"
          type="file"
          aria-label="Choose a file to upload"
          accept=".txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.sql,.css,.go,.rs,.java,.c,.cpp,.h,.sh,.yaml,.yml,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={"wp-drop " + (drag ? "wp-drag" : "")}
          disabled={operation.busy}
          onClick={() => picker.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={24} />
          <strong>{operation.busy ? "Working…" : "Upload a file"}</strong>
          <span>Choose a file or drop it here · up to 5 MiB</span>
        </button>
        {model && data.capabilities.documentEmbeddings && (
          <p className="wp-caption">
            With a connected OpenAI account, similarity search sends up to three
            passages per upload and each submitted query to its embedding model.
          </p>
        )}
        <div className="wp-tabs" aria-label="Search mode">
          {(["files", "passages"] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={mode === searchMode}
              onClick={() => {
                setSearchMode(mode);
                setSearch("");
                setMatches(null);
                searchGeneration.current++;
                searchAction.clear();
              }}
            >
              {mode === "files" ? "Filenames" : "File contents"}
            </button>
          ))}
        </div>
        {searchMode === "passages" ? (
          <>
            <form className="wp-form" onSubmit={searchContents}>
              <label>
                Find passages
                <input
                  value={search}
                  maxLength={400}
                  required
                  placeholder="Enter a question or keyword"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setMatches(null);
                    searchGeneration.current++;
                  }}
                />
              </label>
              <button
                className="wp-btn"
                disabled={!search.trim() || searchAction.busy}
              >
                <Search size={15} />
                Search contents
              </button>
            </form>
            <ErrorNote text={searchAction.error} />
            {matches && (
              <div className="wp-stack" aria-live="polite">
                {matches.length === 0 ? (
                  <Empty icon={Search} title="No matching passages">
                    Try another phrase or keyword.
                  </Empty>
                ) : (
                  matches.map((m) => (
                    <button
                      className="wp-item"
                      key={m.documentId + "-" + m.part}
                      onClick={() => {
                        setSelected(m.documentId);
                        setFocused(m);
                      }}
                    >
                      <FileSearch size={17} />
                      <span>
                        <b>
                          {m.name} · Passage {m.part}
                        </b>
                        <small>
                          {m.body.slice(0, 170)}
                          {m.body.length > 170 ? "…" : ""}
                        </small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <SearchBox
              label="Search filenames"
              value={search}
              onChange={setSearch}
            />
            <div className="wp-stack">
              {filtered.map((f) => (
                <button
                  key={f.id}
                  className={"wp-item " + (f.id === fileId ? "wp-chosen" : "")}
                  aria-pressed={f.id === fileId}
                  onClick={() => {
                    operation.clear();
                    setFocused(null);
                    setSelected(f.id);
                  }}
                >
                  <FileText size={19} />
                  <span>
                    <b>{f.name}</b>
                    <small>
                      {size(f.size)} · {date(f.created_at)}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!filtered.length && (
                <Empty
                  icon={FolderOpen}
                  title={search ? "No matching files" : "No indexed files"}
                >
                  PDF, DOCX, XLSX, text, code, and still images are supported.
                </Empty>
              )}
            </div>
          </>
        )}
      </Panel>
      <Panel title="Document inspector" icon={FileSearch}>
        {meta ? (
          <>
            <div className="wp-row">
              <h3>{meta.name}</h3>
              <button
                className="wp-icon"
                aria-label={"Delete " + meta.name}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {deleting && (
              <div className="wp-confirm">
                <span>Delete this file?</span>
                <button
                  className="wp-btn"
                  disabled={operation.busy}
                  onClick={() =>
                    operation.run(async () => {
                      await act("delete", { kind: "file", id: fileId });
                      setSelected("");
                      setDeleting(false);
                    })
                  }
                >
                  Delete
                </button>
                <button className="wp-sub" onClick={() => setDeleting(false)}>
                  Keep
                </button>
              </div>
            )}
            <p className="wp-metadata">
              {size(meta.size)} · {meta.mime}
            </p>
            <ErrorNote text={loadError} />
            {focused?.documentId === fileId && (
              <div className="wp-answer">
                <h3>Passage {focused.part}</h3>
                <p className="wp-pre">{focused.body}</p>
              </div>
            )}
            {doc?.body && (
              <details className="wp-details">
                <summary>Extracted text</summary>
                <pre>{doc.body}</pre>
              </details>
            )}
            <form className="wp-form" onSubmit={ask}>
              <label>
                Ask about this file
                <textarea
                  rows={3}
                  placeholder="Which details should I pay attention to?"
                  maxLength={6000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  required
                />
              </label>
              {model ? (
                <button
                  className="wp-primary"
                  disabled={!question.trim() || operation.busy}
                >
                  <MessageSquare size={16} />
                  Ask S.C.A.R.L.E.T.
                </button>
              ) : (
                <p className="wp-note">
                  <Link href="/integrations">Connect a model</Link> for document
                  questions. Image questions require a vision-capable model.
                </p>
              )}
            </form>
            {answer?.fileId === fileId && (
              <div className="wp-answer">
                <h3>Answer</h3>
                <p className="wp-pre">{answer.text}</p>
              </div>
            )}
          </>
        ) : (
          <Empty icon={FileSearch} title="Select a document">
            Read its extracted text or ask a question grounded in the file.
          </Empty>
        )}
        <ErrorNote text={operation.error} />
      </Panel>
    </div>
  );
}

function WorkflowResult({ result }: { result: Result }) {
  const source = secureHref(result.url);
  return (
    <div className="wp-result">
      <h3>{result.title || "Result"}</h3>
      {source && (
        <a
          href={source}
          className="wp-source"
          rel="noopener noreferrer"
          target="_blank"
        >
          <Globe2 size={15} />
          {source}
          <ExternalLink size={13} />
        </a>
      )}
      {result.screenshot?.startsWith("data:image/jpeg;base64,") && (
        <figure>
          {/* The reader capture is an already bounded local JPEG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={"Reader view of " + (result.title || "the source")}
            src={result.screenshot}
          />
          <figcaption>Isolated reader view</figcaption>
        </figure>
      )}
      {result.text && <p className="wp-pre wp-scroll-copy">{result.text}</p>}
      {result.sources?.length ? (
        <ol className="wp-sources">
          {result.sources.map((s, i) => (
            <li key={i}>
              <a
                href={secureHref(s.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title} <ExternalLink size={12} />
              </a>
              <p>{s.description}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {result.links?.length ? (
        <details className="wp-details">
          <summary>Links in this source ({result.links.length})</summary>
          <ul className="wp-sources">
            {result.links.map((s, i) => (
              <li key={i}>
                <a
                  href={secureHref(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.label} <ExternalLink size={12} />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {result.delivery || result.event ? (
        <details className="wp-details">
          <summary>Provider receipt</summary>
          <pre>{JSON.stringify(result.delivery ?? result.event, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
function WorkflowDetail({ task, act }: { task: Task; act: Props["act"] }) {
  const [detail, setDetail] = useState<Task | null>(null),
    [loadError, setLoadError] = useState(""),
    [confirming, setConfirming] = useState(false),
    [generation, setGeneration] = useState(0);
  const operation = useAction();
  const live = detail || task;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await get<Task>(
          "tasks/" + encodeURIComponent(task.id),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setDetail(next);
        setLoadError("");
        if (["QUEUED", "PLANNING", "RUNNING"].includes(next.state)) {
          const delay =
            next.state === "QUEUED"
              ? Math.max(
                  2500,
                  new Date(next.run_at).getTime() - Date.now() + 1000,
                )
              : 2500;
          timer = setTimeout(load, Math.min(delay, 2_000_000_000));
        }
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(msg(e));
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [task.id, task.updated_at, generation]);
  const pending = live.state === "WAITING_FOR_APPROVAL";
  const approvedKind = [
    "calendar.publish",
    "email.send",
    "whatsapp.send",
  ].includes(live.kind);
  const canCancel =
    ["QUEUED", "WAITING_FOR_APPROVAL"].includes(live.state) ||
    (!approvedKind && ["PLANNING", "RUNNING"].includes(live.state));
  const p = live.payload || {};
  const action = (verb: "approve" | "cancel") =>
    operation.run(async () => {
      try {
        await act(verb, {
          id: live.id,
          ...(verb === "approve" && { revision: live.revision }),
        });
        setConfirming(false);
      } finally {
        setGeneration((n) => n + 1);
      }
    });
  return (
    <div className="wp-workflow-detail">
      <div className="wp-row">
        <span className="wp-tag">{types[live.kind] || live.kind}</span>
        <Badge state={live.state} />
      </div>
      <h3 className="wp-task-title">{live.title}</h3>
      <div className="wp-meta">
        <Clock3 size={14} />
        {(live.state === "QUEUED" && new Date(live.run_at) > new Date()
          ? "Scheduled "
          : "Created ") +
          date(
            live.state === "QUEUED" && new Date(live.run_at) > new Date()
              ? live.run_at
              : live.created_at,
          )}
      </div>
      {approvedKind && (
        <div className="wp-approval">
          <h4>
            <ShieldCheck size={16} />
            {pending ? "Review this action" : "Action details"}
          </h4>
          <dl>
            {live.kind === "calendar.publish" ? (
              <>
                <dt>Calendar</dt>
                <dd>Connected Google Calendar · Primary</dd>
                <dt>Title</dt>
                <dd>{p.title}</dd>
                <dt>Starts</dt>
                <dd>{date(p.start)}</dd>
                <dt>Ends</dt>
                <dd>{date(p.end)}</dd>
              </>
            ) : (
              <>
                <dt>Service</dt>
                <dd>
                  {live.kind === "email.send" ? "Gmail" : "WhatsApp Business"}
                </dd>
                <dt>Recipient</dt>
                <dd>{p.to}</dd>
                {p.subject && (
                  <>
                    <dt>Subject</dt>
                    <dd>{p.subject}</dd>
                  </>
                )}
                <dt>Message</dt>
                <dd className="wp-pre">{p.body}</dd>
              </>
            )}
          </dl>
          {pending && (
            <button
              type="button"
              disabled={operation.busy}
              className="wp-primary"
              onClick={() => action("approve")}
            >
              <Check size={16} />
              {live.kind === "calendar.publish"
                ? "Approve and publish"
                : "Approve and send"}
            </button>
          )}
        </div>
      )}
      {live.error && <ErrorNote text={live.error} />}
      {detail?.steps?.length ? (
        <div className="wp-steps">
          <h4>Execution log</h4>
          <ol>
            {detail.steps.map((step, i) => (
              <li key={i}>
                <span />
                <div>
                  {step.body}
                  <small>{time(step.created_at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {live.result && Object.keys(live.result).length > 0 && (
        <WorkflowResult result={live.result} />
      )}
      {live.state === "COMPLETED" && (
        <a className="wp-link" download href={"/api/report/task/" + live.id}>
          Download workflow report (.md)
        </a>
      )}
      {canCancel && !confirming && (
        <button
          className="wp-sub"
          disabled={operation.busy}
          onClick={() => setConfirming(true)}
        >
          <Square size={13} />
          Cancel workflow
        </button>
      )}
      {canCancel && confirming && (
        <div className="wp-confirm">
          <span>Cancel this workflow?</span>
          <button
            className="wp-btn"
            disabled={operation.busy}
            onClick={() => action("cancel")}
          >
            Cancel workflow
          </button>
          <button className="wp-sub" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      )}
      <ErrorNote text={operation.error || loadError} />
      {loadError && (
        <button className="wp-sub" onClick={() => setGeneration((n) => n + 1)}>
          Retry
        </button>
      )}
    </div>
  );
}
function Workflows({
  data,
  act,
  browserOnly,
}: SectionProps & { browserOnly: boolean }) {
  const [repeat, setRepeat] = useState(""),
    [count, setCount] = useState(4);
  const [mode, setMode] = useState(browserOnly ? "browser" : "task"),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [runAt, setRunAt] = useState(""),
    [selected, setSelected] = useState(linkId),
    [filter, setFilter] = useState("all");
  const operation = useAction();
  const all = data.tasks.filter(
    (t) => !browserOnly || ["browser", "research"].includes(t.kind),
  );
  const filtered = all.filter(
    (t) =>
      filter === "all" ||
      (filter === "open" && openStates.includes(t.state)) ||
      (filter === "approval" && t.state === "WAITING_FOR_APPROVAL") ||
      (filter === "closed" && !openStates.includes(t.state)),
  );
  const current = filtered.find((t) => t.id === selected) || filtered[0];
  const connectedSearch = data.connections.some((c) => c.kind === "search");
  const available =
    (mode !== "research" || connectedSearch) &&
    (mode !== "browser" || data.capabilities.browser);
  const create = (e: FormEvent) => {
    e.preventDefault();
    void operation.run(async () => {
      let when: string | undefined;
      if (runAt) {
        const instant = new Date(runAt);
        if (
          !Number.isFinite(instant.getTime()) ||
          instant.getTime() <= Date.now()
        )
          throw new Error("Choose a future date and time.");
        when = instant.toISOString();
      }
      const name =
        mode === "browser" ? "Inspect " + new URL(url).hostname : title.trim();
      const result = await act("task", {
        kind: mode,
        title: name.slice(0, 160),
        ...(mode === "research" && { query: title.trim() }),
        ...(mode === "browser" && { url: url.trim() }),
        ...(when && { runAt: when }),
        ...(mode === "reminder" && repeat && { repeat, count }),
      });
      setFilter("all");
      setSelected(result.id);
      setTitle("");
      setUrl("");
      setRunAt("");
    });
  };
  const changeMode = (m: string) => {
    setMode(m);
    setTitle("");
    setUrl("");
    setRunAt("");
    operation.clear();
  };
  return (
    <div className="wp-grid wp-flow-grid">
      <div className="wp-column">
        <Panel
          icon={browserOnly ? Globe2 : Waypoints}
          title={browserOnly ? "Research console" : "New workflow"}
        >
          {browserOnly && (
            <div className="wp-tabs" aria-label="Research type">
              {[
                ["browser", "Inspect website"],
                ["research", "Research topic"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={mode === id}
                  onClick={() => changeMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <form className="wp-form" onSubmit={create}>
            {!browserOnly && (
              <label>
                Workflow type
                <select
                  value={mode}
                  onChange={(e) => changeMode(e.target.value)}
                >
                  <option value="task">Task notification</option>
                  <option value="reminder">Reminder</option>
                  <option value="research">Research report</option>
                  <option value="browser">Inspect website</option>
                </select>
              </label>
            )}
            {mode === "browser" ? (
              <>
                <label>
                  Source URL
                  <input
                    type="url"
                    maxLength={1800}
                    required
                    placeholder="https://example.org/"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <p className="wp-caption">
                  Inspect a public HTTPS page on an approved domain. The reader
                  captures its text, links, and a screenshot.
                </p>
              </>
            ) : (
              <label>
                {mode === "research"
                  ? "Research topic"
                  : mode === "reminder"
                    ? "Reminder"
                    : "Task title"}
                <input
                  placeholder={
                    mode === "research"
                      ? "What would you like to investigate?"
                      : mode === "reminder"
                        ? "e.g. Review the project brief"
                        : "e.g. Review launch checklist"
                  }
                  maxLength={mode === "research" ? 400 : 160}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            {!browserOnly && (
              <label>
                {mode === "reminder"
                  ? "Remind me at"
                  : "Schedule for (optional)"}
                <input
                  type="datetime-local"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                  required={mode === "reminder"}
                />
              </label>
            )}
            {mode === "reminder" && (
              <>
                <label>
                  Repeat
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  >
                    <option value="">Once</option>
                    <option value="daily">Every 24 hours</option>
                    <option value="weekly">Every 7 days</option>
                  </select>
                </label>
                {repeat && (
                  <label>
                    Number of occurrences
                    <input
                      type="number"
                      min={2}
                      max={52}
                      required
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                    />
                  </label>
                )}
              </>
            )}
            {mode === "browser" && !available && (
              <p className="wp-note">
                The operator must configure approved domains before inspection
                is available.
              </p>
            )}
            {mode === "research" && !available && (
              <p className="wp-note">
                <Link href="/integrations">Connect Brave Search</Link> to
                collect sources and create a research report.
              </p>
            )}
            <button
              type="submit"
              className="wp-primary"
              disabled={operation.busy || !available}
            >
              {operation.busy ? (
                <LoaderCircle className="wp-spin" size={16} />
              ) : mode === "browser" ? (
                <Globe2 size={16} />
              ) : mode === "research" ? (
                <Search size={16} />
              ) : (
                <CalendarClock size={16} />
              )}{" "}
              {mode === "browser"
                ? "Inspect source"
                : mode === "research"
                  ? "Start research"
                  : mode === "reminder"
                    ? "Schedule reminder"
                    : "Queue task"}
            </button>
            <ErrorNote text={operation.error} />
          </form>
        </Panel>
        <Panel
          title={browserOnly ? "Research history" : "Workflow queue"}
          icon={ListChecks}
          aside={<SectionCount n={all.length} />}
        >
          {!browserOnly && (
            <label className="wp-filter">
              Show
              <select
                aria-label="Filter workflows"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All workflows</option>
                <option value="open">Active and scheduled</option>
                <option value="approval">Awaiting approval</option>
                <option value="closed">Finished</option>
              </select>
            </label>
          )}
          <div className="wp-stack">
            {filtered.map((t) => (
              <button
                className={
                  "wp-item " + (current?.id === t.id ? "wp-chosen" : "")
                }
                aria-pressed={current?.id === t.id}
                key={t.id}
                onClick={() => setSelected(t.id)}
              >
                <span>
                  <b>{t.title}</b>
                  <small>
                    {types[t.kind] || t.kind} · {date(t.created_at)}
                  </small>
                </span>
                <Badge state={t.state} />
              </button>
            ))}
            {!filtered.length && (
              <Empty
                icon={browserOnly ? BookOpen : ListChecks}
                title={
                  browserOnly
                    ? "No research history"
                    : "No workflows in this view"
                }
              >
                {browserOnly
                  ? "Inspected sources and research reports appear here."
                  : "Queued work, reminders and draft approvals appear here."}
              </Empty>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title={browserOnly ? "Source viewer" : "Execution details"}
        icon={browserOnly ? FileSearch : Activity}
      >
        {current ? (
          <WorkflowDetail key={current.id} task={current} act={act} />
        ) : (
          <Empty
            icon={browserOnly ? Globe2 : Layers}
            title={browserOnly ? "Awaiting a source" : "Select a workflow"}
          >
            {browserOnly
              ? "Run a source inspection to view its reader capture and extracted content."
              : "Choose a workflow to inspect its steps, scheduled time and results."}
          </Empty>
        )}
      </Panel>
    </div>
  );
}

function Timeline({ data }: SectionProps) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all");
  const icons: Record<string, LucideIcon> = {
    security: ShieldCheck,
    approval: ShieldCheck,
    completed: Check,
    memory: Database,
    chat: MessageSquare,
    file: FileText,
    calendar: CalendarClock,
    warning: CircleAlert,
    whatsapp: MessageSquare,
    integration: Waypoints,
    task: ListChecks,
    email: Mail,
  };
  const entries = data.activities.filter(
    (a) =>
      (category === "all" || category === a.kind) &&
      `${a.title} ${a.detail || ""} ${a.kind}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="wp-grid">
      <Panel
        icon={Activity}
        title="Activity history"
        aside={<SectionCount n={data.activities.length} />}
      >
        <div className="wp-filterrow">
          <SearchBox
            value={search}
            onChange={setSearch}
            label="Search activity"
          />
          <label className="wp-filter">
            <span className="wp-hidden">Filter by category</span>
            <select
              aria-label="Activity category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {Array.from(new Set(data.activities.map((a) => a.kind)))
                .sort()
                .map((k) => (
                  <option value={k} key={k}>
                    {readable(k)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <ol className="wp-timeline">
          {entries.map((a) => {
            const Icon = icons[a.kind] || Activity;
            return (
              <li key={a.id}>
                <i>
                  <Icon size={16} />
                </i>
                <div>
                  <span className="wp-tag">{readable(a.kind)}</span>
                  <h3>{a.title}</h3>
                  {a.detail && <p>{a.detail}</p>}
                  <small>{date(a.created_at)}</small>
                </div>
              </li>
            );
          })}
        </ol>
        {!entries.length && (
          <Empty icon={Activity} title="No matching activity">
            Workspace actions will appear here as they happen.
          </Empty>
        )}
      </Panel>
      <Panel
        title="Notifications"
        icon={Bell}
        aside={<SectionCount n={data.notifications.length} />}
      >
        {data.notifications.length ? (
          <ol className="wp-timeline">
            {data.notifications.map((n) => (
              <li key={n.id}>
                <i>
                  <Bell size={16} />
                </i>
                <div>
                  <h3>{n.body}</h3>
                  <small>{date(n.created_at)}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={Bell} title="No notifications yet">
            Completed workflows and due reminders appear here.
          </Empty>
        )}
      </Panel>
    </div>
  );
}

export default function WorkspacePanels(props: Props) {
  const page = props.page.replace(/^\/|\/$/g, "");
  switch (page) {
    case "memory":
      return <Memories {...props} />;
    case "files":
      return <Files {...props} />;
    case "browser":
    case "automations":
      return (
        <Workflows key={page} {...props} browserOnly={page === "browser"} />
      );
    case "activity":
      return <Timeline {...props} />;
    default:
      return null;
  }
}
