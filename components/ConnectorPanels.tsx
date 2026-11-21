"use client";
import Link from "next/link";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  BrainCircuit,
  CalendarDays,
  Check,
  CirclePause,
  Clock3,
  Copy,
  Inbox,
  KeyRound,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import "./connectors.css";

type AnyRow = Record<string, any>;
export interface ConnectorPanelsProps {
  page: string;
  data: any;
  act: (path: string, payload?: any) => Promise<any>;
  refresh: () => Promise<void>;
}
type Context = Pick<ConnectorPanelsProps, "data" | "act">;
type Channel = "email" | "whatsapp";
type Service = "model" | "email" | "calendar" | "search" | "whatsapp";
const services: Record<
  Service,
  { icon: typeof Mail; name: string; intro: string; action: string }
> = {
  model: {
    icon: BrainCircuit,
    name: "Model gateway",
    intro:
      "Bring your model for conversation, reasoning, and document analysis.",
    action: "Choose provider",
  },
  email: {
    icon: Mail,
    name: "Gmail",
    intro: "Read your inbox, prepare replies, and approve outgoing email.",
    action: "Connect Gmail",
  },
  calendar: {
    icon: CalendarDays,
    name: "Google Calendar",
    intro:
      "Read upcoming events and publish approved additions to your calendar.",
    action: "Connect Calendar",
  },
  whatsapp: {
    icon: MessageCircle,
    name: "WhatsApp Business",
    intro:
      "Receive business messages and manage replies for your registered number.",
    action: "Connect number",
  },
  search: {
    icon: Search,
    name: "Brave Search",
    intro: "Search the web and gather cited sources for research workflows.",
    action: "Connect search",
  },
};
const connected = (data: any, kind: string) =>
  (data.connections || []).find((c: AnyRow) => c.kind === kind);
const dateFormat = (value: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(+parsed)
    ? value
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "The operation could not complete.";
const prettyState = (value: string) => value.toLowerCase().replaceAll("_", " ");
const isGmailOrCalendar = (kind: string) =>
  kind === "email" || kind === "calendar";

function useAction() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function run(job: () => Promise<string | void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setFeedback("");
    setFailed(false);
    try {
      setFeedback((await job()) || "");
    } catch (e) {
      setFailed(true);
      setFeedback(errorText(e));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const notice = feedback ? (
    <p
      className={"cp-feedback" + (failed ? " cp-failed" : "")}
      role={failed ? "alert" : "status"}
    >
      {feedback}
    </p>
  ) : null;
  return { pending, run, notice };
}

async function readApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api/" + path, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Could not load this service.");
  return result;
}

function useRemote<T>(path: string | null) {
  const [cycle, reload] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    value?: T;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    setResult({ path });
    readApi<T>(path, ctrl.signal)
      .then((value) => {
        if (!ctrl.signal.aborted) setResult({ path, value });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setResult({ path, error: errorText(e) });
      });
    return () => ctrl.abort();
  }, [path, cycle]);
  return {
    result: result?.path === path ? result : null,
    reload: () => reload((n) => n + 1),
  };
}

function Panel({
  title,
  icon: Icon,
  children,
  side,
}: {
  title: string;
  icon: typeof Mail;
  children: ReactNode;
  side?: ReactNode;
}) {
  return (
    <section className="cp-panel">
      <div className="cp-heading">
        <h2>
          <Icon size={18} />
          {title}
        </h2>
        {side}
      </div>
      {children}
    </section>
  );
}
function Status({ online, text }: { online: boolean; text?: string }) {
  return (
    <span className={"cp-status" + (online ? " is-connected" : "")}>
      <i />
      {text || (online ? "Connected" : "Disconnected")}
    </span>
  );
}
function Empty({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: ReactNode;
}) {
  return (
    <div className="cp-empty">
      <Icon size={24} strokeWidth={1.4} />
      <p>{children}</p>
    </div>
  );
}
function HostStatus({ kind, data }: { kind: Service; data: any }) {
  const item = connected(data, kind);
  const serverNeeded =
    (isGmailOrCalendar(kind) && !data.capabilities?.google) ||
    (kind === "whatsapp" && !data.capabilities?.whatsapp);
  return (
    <div className="cp-channel">
      <div className={"cp-mark cp-mark-" + kind}>
        {kind === "email" ? (
          <Mail />
        ) : kind === "calendar" ? (
          <CalendarDays />
        ) : (
          <MessageCircle />
        )}
      </div>
      <div>
        <strong>{services[kind].name}</strong>
        <small>
          {item?.label ||
            (serverNeeded
              ? "Server setup required"
              : "Account connection available")}
        </small>
      </div>
      <div className="cp-channel-end">
        <Status online={!!item} />
        <Link href="/integrations">Manage connection</Link>
      </div>
    </div>
  );
}

function Configure({
  kind,
  data,
  act,
  close,
}: Context & { kind: Service; close: () => void }) {
  const { pending, run, notice } = useAction();
  const [provider, setProvider] = useState("openai");
  const [secret, setSecret] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const item = connected(data, kind);
  const adminMissing =
    (isGmailOrCalendar(kind) && !data.capabilities?.google) ||
    (kind === "whatsapp" && !data.capabilities?.whatsapp);
  const discover = async () => {
    const response = await act("models", { provider, key: secret });
    if (!Array.isArray(response?.models))
      throw new Error("Model discovery could not complete.");
    setModels(response.models);
    setModel(response.models[0] || "");
    return response.models.length
      ? response.models.length + " available models."
      : "The provider returned no available models.";
  };
  const connect = async () => {
    const result = await act("connect", {
      kind,
      provider,
      model,
      key: secret,
      phoneId,
    });
    if (result?.url) {
      window.location.assign(result.url);
      return;
    }
    if (!result?.ok)
      throw new Error("Connection verification could not complete.");
    setSecret("");
    setModels([]);
    setModel("");
    return "Connection verified.";
  };
  return (
    <div className="cp-config">
      <div className="cp-config-title">
        <strong>Connection settings</strong>
        <button
          type="button"
          className="cp-icon-btn"
          aria-label="Close connection settings"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      {item && <p className="cp-help">Connected to {item.label}.</p>}
      {item ? (
        <button
          className="cp-btn"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              await act("disconnect", { kind });
              return "Connection removed.";
            })
          }
        >
          Disconnect
        </button>
      ) : data.user?.guest ? (
        <p className="cp-help">
          Create an account to store private connections.{" "}
          <Link href="/register">Create account</Link>
        </p>
      ) : adminMissing ? (
        <p className="cp-help">
          {kind === "whatsapp"
            ? "Configure the Meta webhook and Graph API version on the server to connect a business number."
            : "Configure the Google OAuth client and callback URL on the server to enable account linking."}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(kind === "model" && !model ? discover : connect);
          }}
          className="cp-form"
        >
          {kind === "model" && (
            <label>
              Model provider
              <select
                value={provider}
                disabled={pending}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModels([]);
                  setModel("");
                  setSecret("");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="compatible">Compatible endpoint</option>
              </select>
            </label>
          )}
          {!isGmailOrCalendar(kind) && (
            <label>
              {kind === "whatsapp" ? "Business access token" : "API key"}
              <input
                type="password"
                autoComplete="new-password"
                maxLength={3000}
                required
                value={secret}
                disabled={pending}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setModels([]);
                  setModel("");
                }}
              />
            </label>
          )}
          {kind === "whatsapp" && (
            <label>
              Business phone number ID
              <input
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{1,30}"
                required
              />
            </label>
          )}
          {kind === "model" && models.length > 0 && (
            <label>
              Verified model
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            className="cp-btn cp-primary"
            disabled={pending}
          >
            {pending
              ? "Verifying…"
              : isGmailOrCalendar(kind)
                ? "Continue with Google"
                : kind === "model" && !model
                  ? "Discover models"
                  : "Verify and connect"}
          </button>
        </form>
      )}
      {notice}
    </div>
  );
}

function Integrations({ data, act }: Context) {
  const [active, setActive] = useState<Service | null>(null);
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    const selectHash = () => {
      const kind = window.location.hash.slice(1) as Service;
      if (Object.hasOwn(services, kind)) {
        setFilter("All");
        setActive(kind);
      }
    };
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, []);
  const catalog = (data.catalog || []) as AnyRow[];
  const count = data.connections?.length || 0;
  return (
    <div className="cp-container">
      <div className="cp-filter-bar">
        <div className="cp-tabs">
          {["All", "Connected", "Disconnected"].map((f) => (
            <button
              type="button"
              aria-pressed={filter === f}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <small>
          {count} of {catalog.length} connected
        </small>
      </div>
      <div className="cp-services">
        {catalog
          .filter(
            (c) =>
              c.id in services &&
              (filter === "All" ||
                (filter === "Connected") === !!connected(data, c.id)),
          )
          .map((c) => {
            const kind = c.id as Service,
              info = services[kind],
              Icon = info.icon,
              item = connected(data, kind);
            return (
              <article
                key={kind}
                id={kind}
                className={"cp-service" + (active === kind ? " cp-active" : "")}
              >
                <div className="cp-service-top">
                  <div className={"cp-mark cp-mark-" + kind}>
                    <Icon size={23} strokeWidth={1.7} />
                  </div>
                  <Status online={!!item} />
                </div>
                <small className="cp-family">{c.family}</small>
                <h2>{info.name}</h2>
                <p>{info.intro}</p>
                <div className="cp-service-meta">
                  <KeyRound size={13} />
                  {c.auth}
                </div>
                <button
                  type="button"
                  className="cp-service-btn"
                  aria-expanded={active === kind}
                  onClick={() => setActive(active === kind ? null : kind)}
                >
                  <Plug size={15} />
                  {item ? "Manage connection" : info.action}
                </button>
                {active === kind && (
                  <Configure
                    kind={kind}
                    data={data}
                    act={act}
                    close={() => setActive(null)}
                  />
                )}
              </article>
            );
          })}
      </div>
      {filter === "Connected" && !count && (
        <Empty icon={Plug}>Your connected services will appear here.</Empty>
      )}
      {filter === "Disconnected" && count === catalog.length && (
        <Empty icon={Check}>All catalog services are connected.</Empty>
      )}
    </div>
  );
}

function EditDraft({
  draft,
  kind,
  data,
  act,
}: Context & { draft: AnyRow; kind: Channel }) {
  const [editRevision, setEditRevision] = useState<string | null>(null);
  const editing = editRevision !== null;
  const [body, setBody] = useState(draft.payload?.body || "");
  const { pending, run, notice } = useAction();
  const review = draft.state === "WAITING_FOR_APPROVAL";
  const payload = draft.payload || {};
  return (
    <article className="cp-list-item">
      <div className="cp-row">
        <strong>
          {payload.subject ||
            (kind === "email" ? draft.title : "+" + payload.to)}
        </strong>
        <span className="cp-badge">{prettyState(draft.state)}</span>
      </div>
      {kind === "email" && <small>To {payload.to}</small>}
      {editing && review ? (
        <label>
          Message text
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
          />
        </label>
      ) : (
        <p className="cp-body">{payload.body}</p>
      )}
      {draft.error && <p className="cp-feedback cp-failed">{draft.error}</p>}
      <div className="cp-buttons">
        {review &&
          (editing ? (
            <>
              <button
                className="cp-btn"
                disabled={pending || !body.trim()}
                onClick={() =>
                  void run(async () => {
                    await act("draft/edit", {
                      id: draft.id,
                      body,
                      revision: editRevision,
                    });
                    setEditRevision(null);
                    return "Draft saved.";
                  })
                }
              >
                <Check size={14} />
                Save changes
              </button>
              <button
                className="cp-btn"
                disabled={pending}
                onClick={() => setEditRevision(null)}
              >
                Discard edits
              </button>
            </>
          ) : (
            <button
              className="cp-btn"
              onClick={() => {
                setBody(payload.body);
                setEditRevision(draft.revision);
              }}
            >
              <Pencil size={14} />
              Edit
            </button>
          ))}
        {review && !editing && connected(data, kind) && (
          <button
            className="cp-btn cp-primary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await act("approve", {
                  id: draft.id,
                  revision: draft.revision,
                });
                return "Approved for sending.";
              })
            }
          >
            <ShieldCheck size={14} />
            Approve sending
          </button>
        )}
        {review && (
          <button
            className="cp-btn"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await act("cancel", { id: draft.id });
                return "Draft cancelled.";
              })
            }
          >
            Cancel draft
          </button>
        )}
        <button
          className="cp-btn"
          onClick={() =>
            void run(async () => {
              await navigator.clipboard.writeText(payload.body);
              return "Message copied.";
            })
          }
        >
          <Copy size={14} />
          Copy
        </button>
      </div>
      {notice}
    </article>
  );
}

type Prefill = { to: string; subject: string; context: string; key: number };
function DraftComposer({
  data,
  act,
  kind,
  prefill,
}: Context & { kind: Channel; prefill?: Prefill }) {
  const [to, setTo] = useState(prefill?.to || "");
  const [subject, setSubject] = useState(prefill?.subject || "");
  const [body, setBody] = useState("");
  const [instructions, setInstructions] = useState("");
  const { pending, run, notice } = useAction();
  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await act("draft", {
        kind: kind + ".send",
        to,
        ...(kind === "email" ? { subject } : {}),
        body,
      });
      if (!result?.id) throw new Error("Draft could not be saved.");
      setBody("");
      return "Draft saved for approval.";
    });
  };
  return (
    <Panel
      title={kind === "email" ? "Compose email" : "Compose message"}
      icon={Pencil}
    >
      <form className="cp-form" onSubmit={submitDraft}>
        <label>
          {kind === "email" ? "Recipient email" : "Recipient with country code"}
          <input
            type={kind === "email" ? "email" : "tel"}
            required
            value={to}
            maxLength={254}
            pattern={kind === "whatsapp" ? "\\+?[1-9][0-9]{6,14}" : undefined}
            onChange={(e) => setTo(e.target.value)}
            placeholder={kind === "email" ? "name@example.com" : "+1…"}
          />
        </label>
        {kind === "email" && (
          <label>
            Subject
            <input
              required
              maxLength={150}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
        )}
        <label>
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
            required
          />
        </label>
        <details>
          <summary>
            <Sparkles size={14} /> Suggest a reply
          </summary>
          <p className="cp-help">
            Send the selected conversation and your instructions to your
            connected model.
          </p>
          <label>
            Draft instructions
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={700}
            />
          </label>
          <button
            type="button"
            className="cp-btn"
            disabled={
              pending ||
              !connected(data, "model") ||
              !(prefill?.context || instructions.trim() || body.trim())
            }
            onClick={() =>
              void run(async () => {
                const context = JSON.stringify({
                  subject,
                  conversation: prefill?.context?.slice(0, 3500),
                  instructions: instructions.trim(),
                  draft: body.slice(0, 700),
                });
                const r = await act("suggest", { kind, context });
                if (!r?.text) throw new Error("The model returned no draft.");
                setBody(r.text.slice(0, 4000));
                return "Suggestion added. Review the text before saving.";
              })
            }
          >
            Generate suggestion
          </button>
          {!connected(data, "model") && (
            <Link href="/integrations">Connect a model</Link>
          )}
        </details>
        <div className="cp-buttons">
          <button
            type="submit"
            className="cp-btn cp-primary"
            disabled={pending}
          >
            <ShieldCheck size={15} />
            Save for approval
          </button>
          <button
            type="button"
            className="cp-btn"
            disabled={!body.trim() || pending}
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(body);
                return "Message copied.";
              })
            }
          >
            <Copy size={14} />
            Copy text
          </button>
        </div>
      </form>
      {notice}
    </Panel>
  );
}

function InboxView({
  data,
  write,
}: {
  data: any;
  write: (p: Prefill) => void;
}) {
  const [query, setQuery] = useState("in:inbox");
  const [search, setSearch] = useState("in:inbox");
  const [id, setId] = useState("");
  const account = connected(data, "email");
  const list = useRemote<AnyRow[]>(
    account ? "email?q=" + encodeURIComponent(search) : null,
  );
  const detail = useRemote<AnyRow>(
    account && id ? "email/" + encodeURIComponent(id) : null,
  );
  const selected = detail.result?.value;
  return (
    <Panel
      title="Inbox"
      icon={Inbox}
      side={
        account && (
          <button
            className="cp-icon-btn"
            aria-label="Refresh inbox"
            onClick={list.reload}
          >
            <RefreshCw size={15} />
          </button>
        )
      }
    >
      {!account ? (
        <Empty icon={Inbox}>
          Connect Gmail to read and search your inbox. You can prepare a draft
          in this workspace.
        </Empty>
      ) : (
        <>
          <form
            className="cp-inline"
            onSubmit={(e) => {
              e.preventDefault();
              setId("");
              setSearch(query.trim() || "in:inbox");
              list.reload();
            }}
          >
            <input
              aria-label="Search Gmail"
              placeholder="Search Gmail"
              value={query}
              maxLength={300}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="cp-btn" type="submit">
              <Search size={15} />
              Search
            </button>
          </form>
          {list.result?.error ? (
            <p className="cp-feedback cp-failed" role="alert">
              {list.result.error}
            </p>
          ) : !list.result?.value ? (
            <p role="status">Loading inbox…</p>
          ) : list.result.value.length ? (
            <div className="cp-mail-list">
              {list.result.value.map((m) => (
                <button
                  key={m.id}
                  aria-pressed={m.id === id}
                  onClick={() => setId(m.id)}
                >
                  <span>{m.from}</span>
                  <strong>{m.subject || "No subject"}</strong>
                  <small>
                    {m.unread ? "Unread · " : ""}
                    {m.snippet}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={Inbox}>No messages matched this search.</Empty>
          )}
          {id && (
            <div className="cp-message">
              {detail.result?.error ? (
                <p role="alert">{detail.result.error}</p>
              ) : !selected ? (
                <p role="status">Opening message…</p>
              ) : (
                <>
                  <h3>{selected.subject || "No subject"}</h3>
                  <small>
                    {selected.from} · {dateFormat(selected.date)}
                  </small>
                  <p className="cp-body">{selected.body}</p>
                  <button
                    className="cp-btn"
                    onClick={() =>
                      write({
                        to: (
                          selected.from.match(/<([^>]+)>/)?.[1] || selected.from
                        ).trim(),
                        subject: /^re:/i.test(selected.subject)
                          ? selected.subject
                          : "Re: " + selected.subject,
                        context: selected.body,
                        key: Date.now(),
                      })
                    }
                  >
                    <Pencil size={14} />
                    Draft reply
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const defaultPolicy = {
  mode: "manual",
  paused: true,
  allowlist: [] as string[],
  excluded: [] as string[],
  timezone: "UTC",
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  maxPerHour: 5,
};
const splitNumbers = (list: string) => [
  ...new Set(
    list
      .split(/[\s,;]+/)
      .map((n) => n.replace(/^\+/, ""))
      .filter(Boolean),
  ),
];
function Policy({ data, act }: Context) {
  const value = { ...defaultPolicy, ...data.user?.settings?.waPolicy };
  const [form, setForm] = useState<typeof defaultPolicy>(value);
  const [allow, setAllow] = useState(value.allowlist.join(", "));
  const [exclude, setExclude] = useState(value.excluded.join(", "));
  const { pending, run, notice } = useAction();
  const enabled = value.mode === "auto" && value.paused === false;
  const change = (property: string, v: string | number | boolean | number[]) =>
    setForm((old) => ({ ...old, [property]: v }));
  return (
    <Panel
      title="Reply policy"
      icon={ShieldCheck}
      side={
        <Status
          online={enabled}
          text={
            enabled
              ? "Automatic replies enabled"
              : prettyState(value.mode === "auto" ? "paused" : value.mode)
          }
        />
      }
    >
      {enabled && (
        <button
          className="cp-btn"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              await act("whatsapp/policy", { ...value, paused: true });
              change("paused", true);
              return "Automatic replies paused.";
            })
          }
        >
          <CirclePause size={15} />
          Emergency pause
        </button>
      )}
      <form
        className="cp-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const allowlist = splitNumbers(allow),
              excluded = splitNumbers(exclude);
            if (
              [...allowlist, ...excluded].some(
                (n) => !/^[1-9]\d{5,14}$/.test(n),
              )
            )
              throw new Error(
                "Enter international numbers with country codes.",
              );
            if (
              form.mode === "auto" &&
              !form.paused &&
              (!allowlist.length ||
                !form.days.length ||
                form.startHour === form.endHour)
            )
              throw new Error(
                "Choose an allowlist, workdays, and business hours before enabling automatic replies.",
              );
            try {
              new Intl.DateTimeFormat(undefined, {
                timeZone: form.timezone,
              }).format();
            } catch {
              throw new Error("Enter an IANA time zone such as Europe/London.");
            }
            await act("whatsapp/policy", { ...form, allowlist, excluded });
            return "Reply policy saved.";
          });
        }}
      >
        <label>
          Reply mode
          <select
            value={form.mode}
            onChange={(e) => change("mode", e.target.value)}
          >
            <option value="manual">Manual approval</option>
            <option value="assisted">Assisted drafting</option>
            <option value="auto">Policy-based auto-reply</option>
          </select>
        </label>
        <p className="cp-help">
          {form.mode === "auto"
            ? "Eligible messages can receive automatic replies during the configured hours."
            : form.mode === "assisted"
              ? "Review model suggestions before approving a reply."
              : "Write each reply and approve the exact message."}
        </p>
        {form.mode === "auto" && (
          <>
            <label>
              Contact allowlist
              <textarea
                rows={2}
                value={allow}
                onChange={(e) => setAllow(e.target.value)}
                placeholder="International numbers, separated by commas"
              />
            </label>
            <label>
              Excluded contacts
              <textarea
                rows={2}
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
              />
            </label>
            <div className="cp-two">
              <label>
                Business time zone
                <input
                  required
                  value={form.timezone}
                  onChange={(e) => change("timezone", e.target.value)}
                />
              </label>
              <label>
                Hourly reply limit
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={form.maxPerHour}
                  onChange={(e) => change("maxPerHour", +e.target.value)}
                />
              </label>
            </div>
            <fieldset className="cp-days">
              <legend>Working days</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={form.days.includes(i)}
                    onChange={(e) =>
                      change(
                        "days",
                        e.target.checked
                          ? [...form.days, i]
                          : form.days.filter((n) => n !== i),
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </fieldset>
            <div className="cp-two">
              <label>
                Start hour
                <input
                  type="number"
                  min={0}
                  max={23}
                  required
                  value={form.startHour}
                  onChange={(e) => change("startHour", +e.target.value)}
                />
              </label>
              <label>
                End hour
                <input
                  type="number"
                  min={0}
                  max={24}
                  required
                  value={form.endHour}
                  onChange={(e) => change("endHour", +e.target.value)}
                />
              </label>
            </div>
            <label className="cp-check">
              <input
                type="checkbox"
                checked={form.paused}
                onChange={(e) => change("paused", e.target.checked)}
              />
              Pause automatic replies
            </label>
          </>
        )}
        <button className="cp-btn" disabled={pending} type="submit">
          <Check size={15} />
          Save reply policy
        </button>
      </form>
      {notice}
    </Panel>
  );
}
function WAInbox({
  data,
  act,
  write,
}: Context & { write: (p: Prefill) => void }) {
  const messages: AnyRow[] = data.wa || [],
    contacts = [...new Set(messages.map((m) => String(m.contact)))];
  const [selected, setSelected] = useState("");
  const contact = contacts.includes(selected) ? selected : contacts[0] || "";
  const thread = messages
    .filter((m) => m.contact === contact)
    .slice()
    .reverse();
  const handoff = (data.handoffs || []).find(
    (r: AnyRow) => r.contact === contact,
  );
  const optedOut = /opted out/i.test(handoff?.reason || "");
  const { pending, run, notice } = useAction();
  return (
    <Panel
      title="Business conversations"
      icon={MessageCircle}
      side={<small>{contacts.length} contacts</small>}
    >
      {contacts.length === 0 ? (
        <Empty icon={MessageCircle}>
          Conversations appear when customers message your connected business
          number. Personal accounts can use draft and copy.
        </Empty>
      ) : (
        <>
          <label>
            Conversation
            <select
              value={contact}
              onChange={(e) => setSelected(e.target.value)}
            >
              {contacts.map((n) => (
                <option key={n} value={n}>
                  +{n}
                </option>
              ))}
            </select>
          </label>
          <div className="cp-thread">
            {thread.map((m, i) => (
              <article
                key={i}
                className={m.direction === "out" ? "cp-out" : ""}
              >
                <small>
                  {m.direction === "in" ? "Customer" : "Business"} ·{" "}
                  {dateFormat(m.created_at)}
                </small>
                <p className="cp-body">{m.body}</p>
              </article>
            ))}
          </div>
          {handoff && <p className="cp-feedback">{handoff.reason}</p>}
          <div className="cp-buttons">
            <button
              className="cp-btn"
              onClick={() =>
                write({
                  to: "+" + contact,
                  subject: "",
                  context: thread
                    .slice(-5)
                    .map(
                      (m) =>
                        (m.direction === "out" ? "Business" : "Customer") +
                        ": " +
                        m.body,
                    )
                    .join("\n")
                    .slice(-3500),
                  key: Date.now(),
                })
              }
            >
              <Pencil size={14} />
              Draft reply
            </button>
            {!optedOut && (
              <button
                className="cp-btn"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await act("whatsapp/handoff", {
                      contact,
                      paused: !handoff,
                    });
                    return handoff
                      ? "Human handoff cleared."
                      : "Conversation assigned to human handling.";
                  })
                }
              >
                <UserRound size={14} />
                {handoff ? "End human handoff" : "Hand off to human"}
              </button>
            )}
          </div>
          {notice}
        </>
      )}
    </Panel>
  );
}
function Communication({ kind, data, act }: Context & { kind: Channel }) {
  const [prefill, setPrefill] = useState<Prefill>();
  const drafts: AnyRow[] = (data.tasks || []).filter(
    (t: AnyRow) => t.kind === kind + ".send",
  );
  return (
    <div className="cp-container">
      <HostStatus kind={kind} data={data} />
      <div className="cp-split">
        <div className="cp-stack">
          {kind === "email" ? (
            <InboxView data={data} write={setPrefill} />
          ) : (
            <WAInbox data={data} act={act} write={setPrefill} />
          )}
          <Panel
            title="Drafts and delivery"
            icon={Activity}
            side={<Link href="/automations">View workflows</Link>}
          >
            {drafts.length ? (
              drafts.map((d) => (
                <EditDraft
                  key={d.id}
                  draft={d}
                  kind={kind}
                  data={data}
                  act={act}
                />
              ))
            ) : (
              <Empty icon={Mail}>
                Saved drafts and delivery status will appear here.
              </Empty>
            )}
          </Panel>
        </div>
        <div className="cp-stack">
          <DraftComposer
            key={prefill?.key || kind}
            data={data}
            act={act}
            kind={kind}
            prefill={prefill}
          />
          {kind === "whatsapp" && <Policy data={data} act={act} />}
        </div>
      </div>
    </div>
  );
}
function Calendar({ data, act }: Context) {
  const [title, setTitle] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [destination, setDestination] = useState("workspace"),
    [allow, setAllow] = useState(false);
  const account = connected(data, "calendar");
  const remote = useRemote<AnyRow[]>(account ? "calendar" : null);
  const { pending, run, notice } = useAction();
  const local: AnyRow[] = data.events || [];
  const fmt = (d: string, allDay: boolean) => (allDay ? d : dateFormat(d));
  const startTime = Date.parse(start),
    endTime = Date.parse(end);
  const overlaps = local.filter(
    (e) => startTime < Date.parse(e.end_at) && endTime > Date.parse(e.start_at),
  );
  const remove = useAction();
  return (
    <div className="cp-container">
      <HostStatus kind="calendar" data={data} />
      <div className="cp-split">
        <div className="cp-stack">
          <Panel
            title="Workspace calendar"
            icon={CalendarDays}
            side={<small>{local.length} events</small>}
          >
            {local.length ? (
              local.map((e) => (
                <article className="cp-list-item" key={e.id}>
                  <div className="cp-row">
                    <strong>{e.title}</strong>
                    <button
                      className="cp-icon-btn"
                      aria-label={"Delete " + e.title}
                      disabled={remove.pending}
                      onClick={() =>
                        void remove.run(async () => {
                          await act("delete", { kind: "event", id: e.id });
                          return "Event removed.";
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <small>
                    {dateFormat(e.start_at)} – {dateFormat(e.end_at)}
                  </small>
                </article>
              ))
            ) : (
              <Empty icon={CalendarDays}>
                Your workspace calendar is clear. Create an event to add it to
                your schedule.
              </Empty>
            )}
            {remove.notice}
          </Panel>
          {account && (
            <Panel
              title="Google Calendar"
              icon={Link2}
              side={
                <button
                  className="cp-icon-btn"
                  aria-label="Refresh Google Calendar"
                  onClick={remote.reload}
                >
                  <RefreshCw size={15} />
                </button>
              }
            >
              <p className="cp-help">Upcoming events from the next 30 days.</p>
              {remote.result?.error ? (
                <p className="cp-feedback cp-failed" role="alert">
                  {remote.result.error}
                </p>
              ) : !remote.result?.value ? (
                <p role="status">Loading Google events…</p>
              ) : remote.result.value.length ? (
                remote.result.value.map((e) => (
                  <article className="cp-list-item" key={e.id}>
                    <strong>{e.summary}</strong>
                    <small>
                      {fmt(e.start, e.allDay)} – {fmt(e.end, e.allDay)}
                    </small>
                  </article>
                ))
              ) : (
                <Empty icon={CalendarDays}>
                  No upcoming Google Calendar events.
                </Empty>
              )}
            </Panel>
          )}
        </div>
        <Panel title="Create event" icon={Plus}>
          <form
            className="cp-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (
                  !Number.isFinite(startTime) ||
                  !Number.isFinite(endTime) ||
                  endTime <= startTime
                )
                  throw new Error("Choose an end time after the start.");
                const localEvent = destination === "workspace";
                const saved = await act(
                  localEvent ? "event" : "calendar/publish",
                  {
                    title,
                    start: new Date(startTime).toISOString(),
                    end: new Date(endTime).toISOString(),
                    allowConflict: allow,
                  },
                );
                if (!saved?.id)
                  throw new Error("The event could not be saved.");
                setTitle("");
                setStart("");
                setEnd("");
                setAllow(false);
                return localEvent
                  ? "Workspace event created."
                  : "Google Calendar event is waiting for approval in Automations.";
              });
            }}
          >
            <label>
              Event title
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Starts
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setAllow(false);
                }}
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                required
                value={end}
                min={start || undefined}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setAllow(false);
                }}
              />
            </label>
            <small className="cp-timezone">
              <Clock3 size={13} />
              Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </small>
            {overlaps.length > 0 && (
              <div className="cp-conflict">
                <strong>Overlapping workspace events</strong>
                <p>{overlaps.map((o) => o.title).join(", ")}</p>
                <label className="cp-check">
                  <input
                    type="checkbox"
                    checked={allow}
                    onChange={(e) => setAllow(e.target.checked)}
                  />
                  Allow workspace overlap
                </label>
              </div>
            )}
            <label>
              Destination
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="workspace">Workspace calendar</option>
                {account && <option value="google">Google Calendar</option>}
              </select>
            </label>
            <button
              className="cp-btn cp-primary"
              disabled={pending || (!!overlaps.length && !allow)}
            >
              <Plus size={15} />
              {destination === "workspace"
                ? "Create event"
                : "Request approval"}
            </button>
          </form>
          {notice}
          {destination === "google" && (
            <Link href="/automations">Review calendar approvals</Link>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function ConnectorPanels({ page, data, act }: ConnectorPanelsProps) {
  const kind = page.replace(/^\//, "");
  if (kind === "integrations") return <Integrations data={data} act={act} />;
  if (kind === "calendar") return <Calendar data={data} act={act} />;
  if (kind === "email" || kind === "whatsapp")
    return <Communication key={kind} data={data} act={act} kind={kind} />;
  return null;
}
export default ConnectorPanels;
