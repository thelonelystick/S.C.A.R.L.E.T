import { query, type Row } from "./db";
import { publicUser } from "./security";
export const catalog = [
  {
    id: "model",
    name: "Model gateway",
    family: "Intelligence",
    auth: "API key",
    actions: ["chat", "plan", "analyze"],
    scope: "Model inference",
  },
  {
    id: "email",
    name: "Gmail",
    family: "Communication",
    auth: "OAuth 2.0",
    actions: ["mail.read", "mail.draft", "mail.send"],
    scope: "Read inbox and send approved email",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    family: "Productivity",
    auth: "OAuth 2.0",
    actions: ["calendar.read", "calendar.publish"],
    scope: "Read and create calendar events",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    family: "Communication",
    auth: "Business token",
    actions: ["wa.receive", "wa.draft", "wa.send"],
    scope: "Registered business number",
  },
  {
    id: "search",
    name: "Brave Search",
    family: "Research",
    auth: "API key",
    actions: ["web.search"],
    scope: "Public web results",
  },
];
export async function state(u: Row) {
  const args = [u.id];
  const [
    connections,
    activities,
    memories,
    tasks,
    events,
    files,
    conversations,
    notifications,
    wa,
    handoffs,
  ] = await Promise.all([
    query(
      "SELECT kind,label,updated_at FROM connections WHERE user_id=$1",
      args,
    ),
    query(
      "SELECT id,title,detail,kind,created_at FROM audits WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60",
      args,
    ),
    query(
      "SELECT id,title,body,category,expires,created_at FROM memories WHERE user_id=$1 AND (expires IS NULL OR expires>now()) ORDER BY created_at DESC LIMIT 250",
      args,
    ),
    query(
      "SELECT id,title,kind,state,payload,error,run_at,created_at,updated_at,revision::text AS revision FROM tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80",
      args,
    ),
    query(
      "SELECT id,title,start_at,end_at FROM events WHERE user_id=$1 ORDER BY start_at LIMIT 180",
      args,
    ),
    query(
      "SELECT id,name,mime,size,created_at FROM documents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 120",
      args,
    ),
    query(
      "SELECT id,title,created_at FROM conversations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      args,
    ),
    query(
      "SELECT id,body,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
      args,
    ),
    query(
      "SELECT m.contact,m.body,m.direction,m.created_at FROM wa_messages m JOIN connections c ON c.user_id=m.user_id AND c.kind='whatsapp' AND m.phone_id=c.external_id WHERE m.user_id=$1 ORDER BY m.created_at DESC LIMIT 50",
      args,
    ),
    query(
      "SELECT h.contact,h.reason FROM wa_handoffs h JOIN connections c ON c.user_id=h.user_id AND c.kind='whatsapp' AND (h.phone_id=c.external_id OR h.phone_id='') WHERE h.user_id=$1",
      args,
    ),
  ]);
  return {
    user: publicUser(u),
    connections,
    activities,
    memories,
    tasks,
    events,
    files,
    conversations,
    notifications,
    wa,
    handoffs,
    catalog,
    capabilities: {
      documentEmbeddings: !!process.env.EMBEDDING_MODEL,
      google: !!(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI
      ),
      whatsapp: !!(
        process.env.META_APP_SECRET &&
        process.env.META_VERIFY_TOKEN &&
        process.env.META_GRAPH_VERSION
      ),
      browser: !!process.env.RESEARCH_HOSTS,
    },
    now: new Date().toISOString(),
  };
}
