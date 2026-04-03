// ─── Supabase Configuration ──────────────────────────────────────────────
// Configuration is now loaded from config.js (loaded before this script in index.html)
// SUPABASE_URL and SUPABASE_ANON_KEY are defined in config.js
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function initials(name) { return String(name || '?').slice(0, 1).toUpperCase(); }

function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  if (type === 'error') el.style.borderColor = 'rgba(239,68,68,.4)';
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }, 2800);
}

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentConv = null;
let authMode = 'login';
let messageSubscription = null;
let currentTheme = localStorage.getItem('chat_theme') || 'gray';

// ─── Auth ─────────────────────────────────────────────────────────────────────
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.getElementById('authTitle').textContent = signup ? 'Create account' : 'Welcome back';
  document.getElementById('authSubtitle').textContent = signup ? 'Sign up for free' : 'Sign in to your account';
  document.getElementById('loginBtn').textContent = signup ? 'Sign up' : 'Sign in';
  document.getElementById('confirmField').style.display = signup ? 'block' : 'none';
  document.getElementById('usernameField').style.display = signup ? 'block' : 'none';
  document.getElementById('toggleText').textContent = signup ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('toggleAuthBtn').textContent = signup ? 'Sign in' : 'Sign up';

  document.getElementById('confirmInput').value = '';
  showLoginError('');
}

async function handleLogin() {
  const email = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const username = document.getElementById('displayUsernameInput').value.trim();
  const confirm = document.getElementById('confirmInput').value;

  if (!email || !password) { showLoginError('Please fill in all fields'); return; }

  if (authMode === 'login') {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showLoginError(error.message); return; }

    if (document.getElementById('rememberMe').checked) {
      localStorage.setItem('chat_remembered_email', email);
    } else {
      localStorage.removeItem('chat_remembered_email');
    }

    loginSuccess(data.user);
  } else {
    if (!username) { showLoginError('Please choose a username'); return; }
    if (!confirm) { showLoginError('Please confirm your password'); return; }
    if (password !== confirm) { showLoginError('Passwords do not match'); return; }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username: username }
      }
    });

    if (error) { showLoginError(error.message); return; }
    showToast('Check your email for confirmation!');
    if (data.user) loginSuccess(data.user);
  }
}

async function loginSuccess(user) {
  currentUser = user;

  // Fetch user profile to get username
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();

  const displayName = profile?.username || user.email;

  document.getElementById('usernameInput').value = '';
  document.getElementById('passwordInput').value = '';
  document.getElementById('confirmInput').value = '';
  showLoginError('');
  document.getElementById('currentUsername').textContent = displayName;
  document.getElementById('userAvatar').textContent = initials(displayName);
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('chatScreen').classList.add('active');
  document.getElementById('sidebar').classList.add('open'); // Ensure sidebar is open on login
  loadConversations();
  setupGlobalListener();
}

function setTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-white');
  if (theme !== 'gray') document.body.classList.add(`theme-${theme}`);
  currentTheme = theme;
  localStorage.setItem('chat_theme', theme);

  // Update UI
  document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.classList.toggle('active', opt.id === `theme-${theme}`);
  });
}

document.getElementById('theme-gray').addEventListener('click', () => setTheme('gray'));
document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
document.getElementById('theme-white').addEventListener('click', () => setTheme('white'));
setTheme(currentTheme);

async function handleLogout() {
  await supabaseClient.auth.signOut();
  if (messageSubscription) messageSubscription.unsubscribe();
  if (globalSubscription) globalSubscription.unsubscribe();
  globalSubscription = null;
  currentUser = null;
  currentConv = null;

  document.getElementById('msgInput').disabled = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('msgsWrap').style.display = 'none';
  document.getElementById('placeholderState').style.display = 'flex';
  document.getElementById('convList').innerHTML = '';
  document.getElementById('chatName').textContent = 'Select a conversation';
  document.getElementById('chatMembers').textContent = 'Choose a chat from the sidebar';
  document.getElementById('chatAvatar').textContent = '💬';

  document.getElementById('chatScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
  setAuthMode('login');
}

// ─── Conversations ─────────────────────────────────────────────────────────────
async function loadConversations() {
  const q = document.getElementById('searchInput').value.trim();

  // If search query exists, we search for USERS, otherwise we show existing CHATS
  if (q.length > 0) {
    searchUsers(q);
    return;
  }

  const { data: convs, error } = await supabaseClient
    .from('members')
    .select(`
      conversation:conversations (
        id,
        name,
        is_direct,
        created_at
      )
    `)
    .eq('user_id', currentUser.id);

  if (error) { console.error('Error loading conversations:', error); return; }

  let mine = convs.map(c => c.conversation);
  mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const list = document.getElementById('convList');
  list.innerHTML = '';

  if (!mine.length) {
    const empty = document.createElement('div');
    empty.className = 'conv-empty';
    empty.style.whiteSpace = 'pre-line';
    empty.textContent = 'No active chats.\nSearch for a username above\nto start chatting!';
    list.appendChild(empty);
    return;
  }

  // Batch fetch data to avoid N+1 queries
  const convIds = mine.map(c => c.id);
  const directConvIds = mine.filter(c => c.is_direct).map(c => c.id);

  // Fetch all members for direct conversations in one query
  let membersMap = {};
  if (directConvIds.length > 0) {
    const { data: allMembers, error: membersError } = await supabaseClient
      .from('conversation_members')
      .select(`
        conversation_id,
        profile:profiles (username)
      `)
      .in('conversation_id', directConvIds)
      .neq('user_id', currentUser.id);

    if (!membersError && allMembers) {
      allMembers.forEach(member => {
        if (!membersMap[member.conversation_id]) {
          membersMap[member.conversation_id] = member.profile?.username || 'Private Chat';
        }
      });
    }
  }

  // Fetch all messages with counts in one query per conversation
  // We'll fetch messages and count them in batches
  let messageCountsMap = {};
  for (const conv of mine) {
    const lastRead = localStorage.getItem(`chat_read_${conv.id}`) || conv.created_at;
    const { count } = await supabaseClient
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .gt('created_at', lastRead);
    messageCountsMap[conv.id] = count || 0;
  }

  for (const conv of mine) {
    // For direct chats, get the other user's name from our batch
    let chatName = conv.name;
    if (conv.is_direct) {
      chatName = membersMap[conv.id] || 'Private Chat';
    }

    const unreadCount = messageCountsMap[conv.id] || 0;

    const div = document.createElement('div');
    div.className = 'conv-item' + (currentConv?.id === conv.id ? ' active' : '');
    div.addEventListener('click', () => selectConv(conv.id, chatName));

    // avatar
    const avEl = document.createElement('div');
    avEl.className = 'conv-av';
    avEl.textContent = initials(chatName);

    // body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'conv-body';

    const nameEl = document.createElement('div');
    nameEl.className = 'conv-name';
    nameEl.textContent = chatName;

    const lastEl = document.createElement('div');
    lastEl.className = 'conv-last';
    lastEl.textContent = conv.is_direct ? 'Direct Message' : 'Group Chat';

    bodyEl.appendChild(nameEl);
    bodyEl.appendChild(lastEl);

    // meta
    const metaEl = document.createElement('div');
    metaEl.className = 'conv-meta';

    if (unreadCount > 0 && currentConv?.id !== conv.id) {
      const badgeEl = document.createElement('div');
      badgeEl.className = 'conv-badge';
      badgeEl.textContent = unreadCount;
      metaEl.appendChild(badgeEl);
    }

    div.appendChild(avEl);
    div.appendChild(bodyEl);
    div.appendChild(metaEl);
    list.appendChild(div);
  }
}

async function searchUsers(query) {
  // Find Users
  const { data: users } = await supabaseClient
    .from('profiles')
    .select('id, username')
    .neq('id', currentUser.id)
    .ilike('username', `%${query}%`)
    .limit(10);

  // Find Public Groups
  const { data: groups } = await supabaseClient
    .from('conversations')
    .select('id, name')
    .eq('is_direct', false)
    .ilike('name', `%${query}%`)
    .limit(10);

  const list = document.getElementById('convList');
  list.innerHTML = '';

  if (!users?.length && !groups?.length) {
    const empty = document.createElement('div');
    empty.className = 'conv-empty';
    empty.textContent = 'No users or groups found.';
    list.appendChild(empty);
    return;
  }

  groups?.forEach(g => {
    const div = document.createElement('div');
    div.className = 'conv-item';
    div.style.borderLeft = '3px solid var(--accent2)';
    div.addEventListener('click', () => joinGroup(g.id, g.name));

    const avEl = document.createElement('div');
    avEl.className = 'conv-av';
    avEl.style.background = 'var(--accent2)';
    avEl.textContent = initials(g.name);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'conv-body';
    const nameEl = document.createElement('div');
    nameEl.className = 'conv-name';
    nameEl.textContent = g.name;
    const metaEl = document.createElement('div');
    metaEl.className = 'conv-last';
    metaEl.textContent = 'Group · Click to join';
    bodyEl.appendChild(nameEl);
    bodyEl.appendChild(metaEl);

    div.appendChild(avEl);
    div.appendChild(bodyEl);
    list.appendChild(div);
  });

  users?.forEach(user => {
    const div = document.createElement('div');
    div.className = 'conv-item';
    div.style.borderLeft = '3px solid var(--accent)';
    div.addEventListener('click', () => startDirectChat(user.id, user.username));

    const avEl = document.createElement('div');
    avEl.className = 'conv-av';
    avEl.textContent = initials(user.username);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'conv-body';
    const nameEl = document.createElement('div');
    nameEl.className = 'conv-name';
    nameEl.textContent = user.username;
    const metaEl = document.createElement('div');
    metaEl.className = 'conv-last';
    metaEl.textContent = 'Click to chat';
    bodyEl.appendChild(nameEl);
    bodyEl.appendChild(metaEl);

    div.appendChild(avEl);
    div.appendChild(bodyEl);
    list.appendChild(div);
  });
}

async function handleCreateGroup() {
  const name = document.getElementById('groupNameInput').value.trim();
  if (!name) return;

  const { data: conv, error } = await supabaseClient
    .from('conversations')
    .insert([{ is_direct: false, name: name }])
    .select()
    .single();

  if (error) { showToast('Error creating group', 'error'); return; }

  await supabaseClient.from('members').insert([
    { conversation_id: conv.id, user_id: currentUser.id }
  ]);

  document.getElementById('groupNameInput').value = '';
  document.getElementById('createGroupModal').classList.remove('active');
  document.getElementById('searchInput').value = '';

  selectConv(conv.id, conv.name);
  showToast('Created group: ' + name);
}

async function joinGroup(groupId, groupName) {
  const { data: existing } = await supabaseClient
    .from('members')
    .select('id')
    .eq('conversation_id', groupId)
    .eq('user_id', currentUser.id)
    .single();

  if (!existing) {
    await supabaseClient.from('members').insert([{
      conversation_id: groupId, user_id: currentUser.id
    }]);
    showToast('Joined group ' + groupName);
  }

  document.getElementById('searchInput').value = '';
  selectConv(groupId, groupName);
}

async function startDirectChat(otherId, otherUsername) {
  // 1. Check if direct chat already exists
  const { data: existing, error: rpcError } = await supabaseClient.rpc('get_direct_chat_id', {
    user1: currentUser.id,
    user2: otherId
  });

  if (rpcError) {
    console.error('Error checking for existing direct chat:', rpcError);
    showToast('Error checking for existing chat', 'error');
    return;
  }

  if (existing) {
    document.getElementById('searchInput').value = '';
    selectConv(existing, otherUsername);
    return;
  }

  // 2. Otherwise create a new direct conversation
  const { data: conv, error: convErr } = await supabaseClient
    .from('conversations')
    .insert([{ is_direct: true }])
    .select()
    .single();

  if (convErr) { showToast('Error starting chat', 'error'); return; }

  // 3. Add both members
  await supabaseClient.from('members').insert([
    { conversation_id: conv.id, user_id: currentUser.id },
    { conversation_id: conv.id, user_id: otherId }
  ]);

  document.getElementById('searchInput').value = '';
  selectConv(conv.id, otherUsername);
  showToast('Started chat with ' + otherUsername);
}

async function selectConv(id, displayName) {
  const { data: conv, error } = await supabaseClient
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) { console.error('Error selecting conversation:', error); return; }
  currentConv = conv;

  localStorage.setItem(`chat_read_${id}`, new Date().toISOString());

  document.getElementById('chatName').textContent = displayName || currentConv.name;
  document.getElementById('chatMembers').textContent = '1-on-1 Conversation';
  document.getElementById('chatAvatar').textContent = initials(displayName);

  document.getElementById('msgInput').disabled = false;
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('placeholderState').style.display = 'none';
  console.log('Selecting conversation, removing open class from sidebar');
  document.getElementById('msgsWrap').style.display = 'flex';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  localStorage.setItem('chat_sidebar_open', 'false');

  loadConversations();
  loadMessages();
  subscribeToMessages(id);
}

// ─── Messages ─────────────────────────────────────────────────────────────────
async function loadMessages() {
  if (!currentConv) return;
  const { data: msgs, error } = await supabaseClient
    .from('messages')
    .select('*, sender:user_id(email, username)')
    .eq('conversation_id', currentConv.id)
    .order('created_at', { ascending: true });

  if (error) { console.error('Error loading messages:', error); return; }

  renderMessages(msgs);
}

function renderMessages(msgs) {
  const wrap = document.getElementById('msgsWrap');
  const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 60;
  wrap.innerHTML = '';

  let lastDay = '';
  msgs.forEach(msg => {
    const day = formatDay(msg.created_at);
    if (day !== lastDay) {
      lastDay = day;
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      sep.textContent = day;
      wrap.appendChild(sep);
    }

    const isOwn = msg.user_id === currentUser.id;
    const div = document.createElement('div');
    div.className = 'msg ' + (isOwn ? 'own' : 'other');

    const av = document.createElement('div');
    av.className = 'msg-av';
    // Derive sender identity from message object
    let senderIdentity = 'Other';
    if (isOwn) {
      senderIdentity = currentUser.email;
    } else if (msg.sender) {
      // Use sender profile data included from the query
      senderIdentity = msg.sender.email || msg.sender.username || 'Other';
    }
    av.textContent = initials(senderIdentity);

    const body = document.createElement('div');
    body.className = 'msg-body';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.created_at);

    body.appendChild(bubble);
    body.appendChild(time);
    div.appendChild(av);
    div.appendChild(body);
    wrap.appendChild(div);
  });

  if (atBottom) wrap.scrollTop = wrap.scrollHeight;
}

function subscribeToMessages(convId) {
  if (messageSubscription) messageSubscription.unsubscribe();

  messageSubscription = supabaseClient
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, payload => {
      loadMessages();
    })
    .subscribe();
}

let globalSubscription = null;
function setupGlobalListener() {
  if (globalSubscription) return;
  globalSubscription = supabaseClient
    .channel('public:messages:global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      if (payload.new.user_id !== currentUser?.id) {
        // Re-render conversation list to update unread badge counts securely
        loadConversations();
      }
    })
    .subscribe();
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || !currentConv) return;

  const { error } = await supabaseClient
    .from('messages')
    .insert([{
      conversation_id: currentConv.id,
      user_id: currentUser.id,
      text: text
    }]);

  if (error) { showToast('Error sending message', 'error'); console.error(error); return; }

  input.value = '';
  loadMessages();
}

// ─── Event listeners ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authForm').addEventListener('submit', e => {
    e.preventDefault();
    handleLogin();
  });
  document.getElementById('toggleAuthBtn').addEventListener('click', () =>
    setAuthMode(authMode === 'login' ? 'signup' : 'login')
  );

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('msgInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  document.getElementById('searchInput').addEventListener('input', loadConversations);

  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
  });

  document.getElementById('hamBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
  });

  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  });

  // Group Chat Modal Events
  document.getElementById('openGroupModalBtn').addEventListener('click', () => {
    document.getElementById('createGroupModal').classList.add('active');
    document.getElementById('groupNameInput').focus();
    // Hide sidebar on mobile when opening modal
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  });
  document.getElementById('cancelGroupBtn').addEventListener('click', () => {
    document.getElementById('createGroupModal').classList.remove('active');
  });
  document.getElementById('confirmGroupBtn').addEventListener('click', handleCreateGroup);
  document.getElementById('groupNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleCreateGroup();
  });

  // Auto-fill remembered email
  const rememberedEmail = localStorage.getItem('chat_remembered_email');
  if (rememberedEmail) {
    document.getElementById('usernameInput').value = rememberedEmail;
    document.getElementById('rememberMe').checked = true;
  }

  // Initial session check
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      loginSuccess(session.user);
    } else {
      document.getElementById('loginScreen').classList.add('active');
      document.getElementById('chatScreen').classList.remove('active');
    }
  });

  // Listen for auth state changes globally
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      loginSuccess(session.user);
    } else if (event === 'SIGNED_OUT') {
      handleLogout();
    }
  });
});