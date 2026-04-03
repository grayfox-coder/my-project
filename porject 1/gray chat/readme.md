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

### 3. Add your Supabase credentials

Open `script.js` and replace the placeholder values:

```js
const SUPABASE_URL = 'your-project-url';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

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
  id uuid references auth.users primary key,
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
  conversation_id uuid references conversations(id),
  user_id uuid references profiles(id),
  primary key (conversation_id, user_id)
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  sender_id uuid references profiles(id),
  content text not null,
  created_at timestamp default now()
);
```

> ⚠️ Make sure to enable **Row Level Security** and add appropriate policies for each table.

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