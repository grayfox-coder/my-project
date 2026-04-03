# 💬 Gray Chat

A real-time chat application with support for direct messages and group conversations, built with vanilla JavaScript and powered by Supabase.

🔗 **Live Demo:** [chat-app-tan-six-81.vercel.app](https://chat-app-tan-six-81.vercel.app)

---

## ✨ Features

- 🔐 **Authentication** — Sign up / sign in with email and password
- 💬 **Direct Messaging** — Chat privately with any registered user
- 👥 **Group Chats** — Create group conversations with multiple users
- 🎨 **Themes** — Switch between Gray, Dark, and White themes
- 🔍 **Search** — Find users and groups instantly
- 📱 **Responsive** — Works on desktop and mobile
- ⚡ **Real-time** — Messages appear instantly using Supabase Realtime
- 🔒 **Secure** — Powered by Supabase with Row Level Security (RLS)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend & Auth | [Supabase](https://supabase.com) |
| Real-time | Supabase Realtime |
| Hosting | [Vercel](https://vercel.com) |
| Fonts | Google Fonts (Inter) |

---

## 🚀 Getting Started

### Prerequisites

- A [Supabase](https://supabase.com) account and project
- A code editor (VS Code recommended)

### 1. Clone the repository

```bash
git clone https://github.com/grayfox-coder/chat-app.git
cd chat-app
```

### 2. Set up Supabase

1. Go to your [Supabase dashboard](https://app.supabase.com) and create a new project.
2. In the SQL editor, create the required tables (see [Database Schema](#database-schema) below).
3. Enable **Row Level Security (RLS)** on all tables.
4. Copy your **Project URL** and **anon public key** from `Settings → API`.

### 3. Configure Supabase credentials

To keep your credentials secure and prevent accidental commits to version control:

1. **Create `js/config.js`** from the template:
   - Copy `js/config.example.js` to `js/config.js`
   - Open `js/config.js` and replace the placeholder values with your actual Supabase credentials:
     ```js
     const SUPABASE_URL = 'your-project-url';
     const SUPABASE_ANON_KEY = 'your-anon-key';
     ```
   - You can find these credentials in your [Supabase dashboard](https://app.supabase.com) under **Settings → API**

2. **Alternatively, use environment variables** (if using a build tool):
   - Create a `.env` file from the `.env.example` template
   - Update your build process to inject these values at build time
   - Ensure `.env` is listed in `.gitignore`

3. **Keep credentials secure**:
   - `js/config.js` is already listed in `.gitignore` — never commit it
   - Always use `js/config.example.js` as a template for documentation
   - Never commit `.env` files to version control

The app automatically loads `js/config.js` before executing the main script, so no manual configuration of credentials in HTML or JS files is needed.

### 4. Run locally

Since this is a static app, just open `index.html` in your browser — or use a local server:

```bash
# Using VS Code Live Server extension, or:
npx serve .
```

---

## 🗄️ Database Schema

Run this SQL in your Supabase SQL editor to set up the required tables:

```sql
-- Users table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamp default now()
);

-- Conversations (direct or group)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean default false,
  created_at timestamp default now()
);

-- Conversation members
create table conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamp default now()
);

-- Create indexes for better query performance
create index idx_profiles_username on profiles(username);
create index idx_messages_conversation_id on messages(conversation_id);
create index idx_messages_sender_id on messages(sender_id);
create index idx_messages_created_at on messages(created_at);
create index idx_conversation_members_user_id on conversation_members(user_id);
```

---

## 🔒 Row Level Security (RLS) Policies

After creating the schema, enable RLS on all tables and add the following policies. Run these statements in your Supabase SQL editor:

```sql
-- Enable RLS on all tables
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Profiles: Public read, users can only update/insert their own
create policy "profiles_public_read" on profiles for select using (true);
create policy "profiles_own_update" on profiles for update using (auth.uid() = id);
create policy "profiles_own_insert" on profiles for insert with check (auth.uid() = id);

-- Conversations: Users can select conversations they are members of
create policy "conversations_member_select" on conversations for select using (
  exists (
    select 1 from conversation_members
    where conversation_members.conversation_id = id
    and conversation_members.user_id = auth.uid()
  )
);
create policy "conversations_insert" on conversations for insert with check (auth.uid() is not null);

-- Create a trigger to automatically add the creator to conversation_members
create or replace function add_creator_to_members()
returns trigger as $$
begin
  insert into conversation_members (conversation_id, user_id)
  values (new.id, auth.uid())
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger conversations_add_creator
after insert on conversations
for each row
execute function add_creator_to_members();

-- Conversation members: Only members can see membership, users can add themselves to group conversations
create policy "conversation_members_select" on conversation_members for select using (
  conversation_members.user_id = auth.uid() or
  exists (
    select 1 from conversation_members cm
    where cm.conversation_id = conversation_members.conversation_id
    and cm.user_id = auth.uid()
  )
);
create policy "conversation_members_own_insert" on conversation_members for insert with check (
  auth.uid() = user_id and
  (
    -- Allow joining group conversations (not direct chats)
    exists (
      select 1 from conversations
      where conversations.id = conversation_members.conversation_id
      and conversations.is_direct = false
    )
    or
    -- Allow if user is the conversation creator (will be added by trigger)
    exists (
      select 1 from conversations
      where conversations.id = conversation_members.conversation_id
      and conversations.id in (
        select conversation_id from conversation_members
        where user_id = auth.uid()
      )
    )
  )
);

-- Messages: Users can read messages from their conversations, send to their conversations
create policy "messages_conversation_select" on messages for select using (
  exists (
    select 1 from conversation_members
    where conversation_members.conversation_id = messages.conversation_id
    and conversation_members.user_id = auth.uid()
  )
);
create policy "messages_own_insert" on messages for insert with check (
  auth.uid() = sender_id and
  exists (
    select 1 from conversation_members
    where conversation_id = messages.conversation_id
    and user_id = auth.uid()
  )
);
```

> 💡 **Note:** These policies should be reviewed and adjusted based on your deployment requirements. Test thoroughly before going to production.
>
> **Security Considerations:**
> - **Conversation Creation:** When a user creates a conversation, a database trigger automatically adds them to `conversation_members`. This ensures no orphaned conversations exist.
> - **Group Conversations:** Users can self-join any public group conversation (where `is_direct = false`). To restrict access, add an `invitations` table or use a custom permission system.
> - **Direct Conversations:** Direct messages are meant for one-on-one communication. Both members are added when the conversation is created; the RLS policy prevents unauthorized joining of direct conversations.
> - **Consider adding** a `conversation_invitations` table if you need to support invite-only group conversations in the future.

---

## 📁 Project Structure

```
chat-app/
├── index.html      # Main chat UI
├── admin.html      # Admin panel
├── script.js       # App logic & Supabase integration
├── style.css       # Styles & themes
└── logo.png        # App logo
```

---

## 📸 Screenshots

> _Add screenshots here once the app is live._

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">Made with ❤️ by <a href="https://github.com/grayfox-coder">grayfox-coder</a></p>