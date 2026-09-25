import { FormEvent, ReactElement, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { loadWorkspaceState, saveWorkspaceState, type Expense, type Memory, type Message, type RoutineItem, type Task, type WorkspaceState } from './lib/persistence';
import { isSupabaseConfigured, signInWithGoogle, supabase } from './lib/supabase';

type View = 'dashboard' | 'chat' | 'tasks' | 'budget' | 'routine' | 'memory' | 'settings';
const navigation: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'chat', label: 'Chat', icon: '◌' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'budget', label: 'Budget', icon: '₹' },
  { id: 'routine', label: 'Routine', icon: '◷' },
  { id: 'memory', label: 'Memory', icon: '◇' },
];

const initialMessages: Message[] = [
  { role: 'assistant', text: 'Good morning. I am ready when you are.', time: '09:41' },
  { role: 'user', text: 'What should I focus on today?', time: '09:42' },
  { role: 'assistant', text: 'You have two tasks due today and your next routine starts at 18:30. I can help you plan the rest.', time: '09:42' },
];

const initialTasks: Task[] = [
  { id: 1, title: 'Finish project proposal', due: 'Today', priority: 'High', completed: false },
  { id: 2, title: 'Review study notes', due: 'Today', priority: 'Medium', completed: false },
  { id: 3, title: 'Morning planning', due: 'Completed 09:10', priority: 'Low', completed: true },
];

const initialExpenses: Expense[] = [
  { id: 1, description: 'Groceries', category: 'Food', amount: 1240, date: 'Sep 24' },
  { id: 2, description: 'Metro recharge', category: 'Transport', amount: 500, date: 'Sep 22' },
  { id: 3, description: 'Notebook', category: 'Education', amount: 280, date: 'Sep 20' },
];

const initialRoutine: RoutineItem[] = [
  { id: 1, title: 'Evening walk', time: '18:30', days: 'Every day', enabled: true },
  { id: 2, title: 'Read', time: '21:00', days: 'Mon · Wed · Fri', enabled: true },
  { id: 3, title: 'Weekly planning', time: '09:00', days: 'Sunday', enabled: false },
];

const initialMemories: Memory[] = [
  { id: 1, type: 'Preference', content: 'I prefer short, direct answers.', updated: 'Updated today' },
  { id: 2, type: 'Project', content: 'My project is called SCARLET.', updated: 'Updated yesterday' },
];

const initialWorkspace: WorkspaceState = {
  messages: initialMessages,
  tasks: initialTasks,
  expenses: initialExpenses,
  routines: initialRoutine,
  memories: initialMemories,
  voice: true,
  launch: false,
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

function App(): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [workspaceReady, setWorkspaceReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState('');
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [messages, setMessages] = useState<Message[]>(initialWorkspace.messages);
  const [draft, setDraft] = useState('');
  const [tasks, setTasks] = useState<Task[]>(initialWorkspace.tasks);
  const [expenses, setExpenses] = useState<Expense[]>(initialWorkspace.expenses);
  const [routines, setRoutines] = useState<RoutineItem[]>(initialWorkspace.routines);
  const [memories, setMemories] = useState<Memory[]>(initialWorkspace.memories);
  const [voice, setVoice] = useState(initialWorkspace.voice);
  const [launch, setLaunch] = useState(initialWorkspace.launch);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setWorkspaceReady(false);
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading || (isSupabaseConfigured && !user)) return;
    setWorkspaceReady(false);
    void loadWorkspaceState(user, initialWorkspace)
      .then((state) => {
        setMessages(state.messages);
        setTasks(state.tasks);
        setExpenses(state.expenses);
        setRoutines(state.routines);
        setMemories(state.memories);
        setVoice(state.voice);
        setLaunch(state.launch);
        setWorkspaceReady(true);
      })
      .catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : 'Unable to load workspace data.');
        setWorkspaceReady(true);
      });
  }, [authLoading, user]);

  useEffect(() => {
    if (!workspaceReady) return;
    void saveWorkspaceState(user, { messages, tasks, expenses, routines, memories, voice, launch }).catch((error: unknown) => {
      setAuthError(error instanceof Error ? error.message : 'Unable to save workspace data.');
    });
  }, [workspaceReady, user, messages, tasks, expenses, routines, memories, voice, launch]);

  if (authLoading || !workspaceReady) return <LoadingScreen />;
  if (isSupabaseConfigured && !user) return <AuthScreen error={authError} onSignIn={() => { setAuthError(''); void signInWithGoogle().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : 'Google sign-in failed.')); }} />;

  const openChat = (): void => setActiveView('chat');

  const sendMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { role: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      { role: 'assistant', text: 'I have noted that. Tool execution and long-term memory arrive in the next phase.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);
    setDraft('');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div><p className="brand-name">SCARLET</p><p className="brand-caption">personal intelligence</p></div>
        </div>
        <button className="new-chat" onClick={() => { setMessages([]); setActiveView('chat'); }}><span>＋</span> New conversation</button>
        <div className="nav-group">
          <p className="nav-label">Workspace</p>
          {navigation.map((item) => <button className={`nav-item ${activeView === item.id ? 'active' : ''}`} key={item.id} onClick={() => setActiveView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        </div>
        <div className="sidebar-footer">
          <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}><span className="nav-icon">⚙</span>Settings</button>
          <div className="profile-row"><div className="profile-avatar">A</div><div><p className="profile-name">Alex</p><p className="profile-status">Local workspace</p></div><span className="status-dot" /></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div><p className="eyebrow">Friday, September 25, 2026</p><h1>{activeView === 'dashboard' ? `${getGreeting()}, Alex` : navigation.find((item) => item.id === activeView)?.label ?? 'Settings'}</h1></div><div className="topbar-actions"><span className="connection-state"><span className="status-dot" /> Local and private</span><button className="icon-button" title="Minimize to tray" onClick={() => window.scarlet?.minimizeToTray()}>—</button></div></header>
          {activeView === 'dashboard' ? <Dashboard onOpenChat={openChat} /> : activeView === 'chat' ? <Chat messages={messages} draft={draft} setDraft={setDraft} sendMessage={sendMessage} /> : activeView === 'tasks' ? <Tasks tasks={tasks} setTasks={setTasks} /> : activeView === 'budget' ? <Budget expenses={expenses} setExpenses={setExpenses} /> : activeView === 'routine' ? <Routine routines={routines} setRoutines={setRoutines} /> : activeView === 'memory' ? <MemoryView memories={memories} setMemories={setMemories} /> : <Settings voice={voice} launch={launch} onVoiceChange={() => setVoice(!voice)} onLaunchChange={() => setLaunch(!launch)} onSignOut={() => void supabase?.auth.signOut()} />}
      </main>
    </div>
  );
}

function LoadingScreen(): ReactElement { return <div className="auth-shell"><div className="auth-panel"><div className="brand-mark">S</div><p className="section-kicker">SCARLET</p><h1>Restoring your workspace</h1><p className="muted-copy">Connecting your saved conversations and routines.</p></div></div>; }

function AuthScreen({ error, onSignIn }: { error: string; onSignIn: () => void }): ReactElement { return <div className="auth-shell"><div className="auth-panel"><div className="brand-mark">S</div><p className="section-kicker">SCARLET</p><h1>Your workspace, wherever you are.</h1><p className="muted-copy">Sign in with Google to keep conversations, tasks, budgets, routines, and memories synced securely.</p><button className="primary-button auth-button" onClick={onSignIn}>Continue with Google <span>→</span></button>{error && <p className="auth-error">{error}</p>}</div></div>; }

function Dashboard({ onOpenChat }: { onOpenChat: () => void }): ReactElement {
  return <div className="content dashboard-content">
    <section className="welcome-panel"><div><p className="section-kicker">Your day at a glance</p><h2>A clear mind starts with a clear next step.</h2><p className="muted-copy">SCARLET is ready to help you stay focused, one useful action at a time.</p></div><button className="primary-button" onClick={onOpenChat}>Ask SCARLET <span>→</span></button></section>
    <section className="metric-grid"><MetricCard label="Tasks" value="2" detail="pending today" accent="scarlet" /><MetricCard label="Budget" value="₹ 18,420" detail="remaining this month" accent="gold" /><MetricCard label="Routine" value="18:30" detail="next activity · Evening walk" accent="mint" /></section>
    <section className="lower-grid"><div className="surface-panel"><div className="panel-heading"><div><p className="section-kicker">Today</p><h3>Priorities</h3></div><button className="text-button">View tasks →</button></div><div className="priority-row"><span className="priority-marker high" /><div><p>Finish project proposal</p><span>Due today · High priority</span></div><span className="row-arrow">›</span></div><div className="priority-row"><span className="priority-marker medium" /><div><p>Review study notes</p><span>Due today · Medium priority</span></div><span className="row-arrow">›</span></div><div className="priority-row complete"><span className="priority-marker done">✓</span><div><p>Morning planning</p><span>Completed at 09:10</span></div></div></div><div className="surface-panel"><div className="panel-heading"><div><p className="section-kicker">Coming up</p><h3>Routine</h3></div><button className="text-button">Open routine →</button></div><div className="routine-highlight"><div className="routine-time">18:30</div><div><p>Evening walk</p><span>Today · 30 minutes</span></div></div><div className="routine-highlight"><div className="routine-time muted-time">21:00</div><div><p>Read</p><span>Today · 45 minutes</span></div></div></div></section>
    <section className="activity-line"><span className="activity-pulse" /><span>Workspace is ready</span><span className="activity-separator">·</span><span>Last synced locally just now</span></section>
  </div>;
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }): ReactElement { return <div className={`metric-card ${accent}`}><div className="metric-top"><span>{label}</span><span className="metric-glyph">↗</span></div><strong>{value}</strong><small>{detail}</small></div>; }

function Chat({ messages, draft, setDraft, sendMessage }: { messages: Message[]; draft: string; setDraft: (value: string) => void; sendMessage: (event: FormEvent<HTMLFormElement>) => void }): ReactElement { return <div className="chat-view"><div className="conversation-meta"><span>New conversation</span><span className="meta-dot">·</span><span>Local</span></div><div className="message-list">{messages.length === 0 ? <div className="empty-chat"><div className="empty-symbol">S</div><h2>What can I help you with?</h2><p>Ask about your tasks, budget, routine, or anything on your mind.</p></div> : messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.time}-${index}`}><div className="message-avatar">{message.role === 'assistant' ? 'S' : 'A'}</div><div className="message-body"><div className="message-header"><strong>{message.role === 'assistant' ? 'SCARLET' : 'You'}</strong><span>{message.time}</span></div><p>{message.text}</p></div></div>)}</div><form className="chat-composer" onSubmit={sendMessage}><button className="voice-button" type="button" title="Voice input">◉</button><input aria-label="Message SCARLET" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message SCARLET..." /><button className="send-button" type="submit" title="Send message">↑</button></form><p className="composer-note">SCARLET is local-first. AI providers and voice will be configurable in later phases.</p></div>; }

function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactElement }): ReactElement {
  return <section className="page-intro"><div><p className="section-kicker">{eyebrow}</p><h2>{title}</h2><p className="muted-copy">{detail}</p></div>{action}</section>;
}

function Tasks({ tasks, setTasks }: { tasks: Task[]; setTasks: (tasks: Task[]) => void }): ReactElement {
  const [draft, setDraft] = useState('');
  const pending = tasks.filter((task) => !task.completed).length;
  const addTask = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setTasks([{ id: Date.now(), title, due: 'No due date', priority: 'Medium', completed: false }, ...tasks]);
    setDraft('');
  };
  return <div className="content workspace-content"><PageIntro eyebrow={`${pending} pending`} title="Tasks" detail="Keep the important work visible and moving." action={<button className="primary-button" onClick={() => document.getElementById('task-input')?.focus()}>＋ Add task</button>} /><div className="workspace-toolbar"><span className="filter-chip active">All tasks</span><span className="filter-chip">Today</span><span className="filter-chip">Completed</span><span className="toolbar-spacer" /><span className="muted-label">{tasks.length} total</span></div><div className="list-panel"><form className="inline-add" onSubmit={addTask}><span className="add-symbol">＋</span><input id="task-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task..." aria-label="New task" /></form>{tasks.map((task) => <div className={`data-row ${task.completed ? 'is-complete' : ''}`} key={task.id}><button className={`check-button ${task.completed ? 'checked' : ''}`} onClick={() => setTasks(tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item))} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.completed ? '✓' : ''}</button><div className="data-main"><p>{task.title}</p><span>{task.due}</span></div><span className={`priority-label ${task.priority.toLowerCase()}`}>{task.priority}</span><button className="row-action" onClick={() => setTasks(tasks.filter((item) => item.id !== task.id))} aria-label={`Delete ${task.title}`}>×</button></div>)}</div></div>;
}

function Budget({ expenses, setExpenses }: { expenses: Expense[]; setExpenses: (expenses: Expense[]) => void }): ReactElement {
  const [draft, setDraft] = useState('');
  const spent = expenses.reduce((total, expense) => total + expense.amount, 0);
  const addExpense = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setExpenses([{ id: Date.now(), description: 'New expense', category: 'Other', amount, date: 'Today' }, ...expenses]);
    setDraft('');
  };
  return <div className="content workspace-content"><PageIntro eyebrow="September 2026" title="Budget" detail="A calm view of what has moved through your month." action={<button className="primary-button" onClick={() => document.getElementById('expense-input')?.focus()}>＋ Add expense</button>} /><section className="budget-summary"><div><span>Monthly budget</span><strong>₹ 20,000</strong></div><div><span>Spent</span><strong>₹ {spent.toLocaleString('en-IN')}</strong></div><div><span>Remaining</span><strong className="remaining">₹ {(20000 - spent).toLocaleString('en-IN')}</strong></div></section><div className="budget-layout"><div className="list-panel"><div className="panel-heading compact"><div><p className="section-kicker">Recent activity</p><h3>Expenses</h3></div></div><form className="inline-add" onSubmit={addExpense}><span className="currency-symbol">₹</span><input id="expense-input" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add amount..." aria-label="Expense amount" /></form>{expenses.map((expense) => <div className="data-row" key={expense.id}><div className="category-badge">{expense.category.slice(0, 1)}</div><div className="data-main"><p>{expense.description}</p><span>{expense.category} · {expense.date}</span></div><strong className="expense-amount">₹ {expense.amount.toLocaleString('en-IN')}</strong><button className="row-action" onClick={() => setExpenses(expenses.filter((item) => item.id !== expense.id))} aria-label={`Delete ${expense.description}`}>×</button></div>)}</div><div className="surface-panel category-panel"><div className="panel-heading compact"><div><p className="section-kicker">By category</p><h3>Where it goes</h3></div></div>{['Food', 'Transport', 'Education', 'Other'].map((category, index) => <div className="category-line" key={category}><div><span>{category}</span><strong>₹ {[1240, 500, 280, 0][index].toLocaleString('en-IN')}</strong></div><div className="progress-track"><span style={{ width: `${[62, 25, 14, 4][index]}%` }} /></div></div>)}</div></div></div>;
}

function Routine({ routines, setRoutines }: { routines: RoutineItem[]; setRoutines: (routines: RoutineItem[]) => void }): ReactElement {
  return <div className="content workspace-content"><PageIntro eyebrow="Your rhythm" title="Routine" detail="Build a repeatable day without making it rigid." action={<button className="primary-button" onClick={() => setRoutines([...routines, { id: Date.now(), title: 'New routine', time: '12:00', days: 'Every day', enabled: true }])}>＋ Add routine</button>} /><div className="segmented-control"><span className="selected">TODAY</span><span>WEEK</span><span>UPCOMING</span></div><div className="list-panel routine-list">{routines.map((routine) => <div className={`data-row routine-row ${routine.enabled ? '' : 'disabled'}`} key={routine.id}><div className="routine-clock">{routine.time}</div><div className="data-main"><p>{routine.title}</p><span>{routine.days}</span></div><button className={`toggle ${routine.enabled ? 'on' : ''}`} onClick={() => setRoutines(routines.map((item) => item.id === routine.id ? { ...item, enabled: !item.enabled } : item))} aria-label={`Toggle ${routine.title}`}><span /></button><button className="row-action" onClick={() => setRoutines(routines.filter((item) => item.id !== routine.id))} aria-label={`Delete ${routine.title}`}>×</button></div>)}</div></div>;
}

function MemoryView({ memories, setMemories }: { memories: Memory[]; setMemories: (memories: Memory[]) => void }): ReactElement {
  return <div className="content workspace-content"><PageIntro eyebrow={`${memories.length} stored memories`} title="Memory" detail="Review the useful things SCARLET is allowed to remember." action={<button className="primary-button" onClick={() => setMemories([{ id: Date.now(), type: 'Fact', content: 'New memory to review.', updated: 'Added just now' }, ...memories])}>＋ Add memory</button>} /><div className="notice-strip"><span>◇</span><p>Memories are explicit and removable. Nothing is stored silently in this phase.</p></div><div className="memory-grid">{memories.map((memory) => <div className="memory-card" key={memory.id}><div className="memory-card-top"><span className="memory-type">{memory.type}</span><button className="row-action" onClick={() => setMemories(memories.filter((item) => item.id !== memory.id))} aria-label={`Forget memory: ${memory.content}`}>×</button></div><p>{memory.content}</p><span className="memory-updated">{memory.updated}</span></div>)}</div></div>;
}

function Settings({ voice, launch, onVoiceChange, onLaunchChange, onSignOut }: { voice: boolean; launch: boolean; onVoiceChange: () => void; onLaunchChange: () => void; onSignOut: () => void }): ReactElement {
  return <div className="content workspace-content"><PageIntro eyebrow="Workspace" title="Settings" detail="Shape how SCARLET feels and where it keeps your information." /><div className="settings-panel"><SettingRow title="Voice responses" detail="Allow spoken responses when voice providers are connected." enabled={voice} onToggle={onVoiceChange} /><SettingRow title="Launch at startup" detail="Keep SCARLET close at hand when your computer starts." enabled={launch} onToggle={onLaunchChange} /><div className="setting-row"><div><p>AI provider</p><span>Configured in the secure desktop process</span></div><span className="setting-value">Not connected</span></div><div className="setting-row"><div><p>Data location</p><span>{isSupabaseConfigured ? 'Encrypted Supabase workspace' : 'Local browser storage'}</span></div><span className="setting-value">{isSupabaseConfigured ? 'Synced' : 'Local'}</span></div><div className="setting-row"><div><p>Account</p><span>Google authentication and workspace sync</span></div><button className="text-button" onClick={onSignOut}>Sign out</button></div></div></div>;
}

function SettingRow({ title, detail, enabled, onToggle }: { title: string; detail: string; enabled: boolean; onToggle: () => void }): ReactElement { return <div className="setting-row"><div><p>{title}</p><span>{detail}</span></div><button className={`toggle ${enabled ? 'on' : ''}`} onClick={onToggle} aria-label={`Toggle ${title}`}><span /></button></div>; }

export default App;
