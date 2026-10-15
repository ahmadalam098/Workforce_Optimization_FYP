# FYP_CHAT - real-time chat server (Node.js)

WhatsApp-style chat between an **Organization Manager** and the organizations the admin assigned to them, over WebSockets (Socket.IO).

```
Manager's browser ──WebSocket──► this server (Node.js, port 4000) ──HTTP──► ASP.NET API ──► SQL Server (Chat_Message)
```

* The server **stores nothing**. Every message is saved by the ASP.NET API (`/api/manager/chat/*` for the manager, `/api/internal/chat/*` for the organization side); the server only checks who you are and delivers the saved message instantly to everyone in the conversation (all tabs of the manager + the organization).
* **Sign-in:** the browser sends the HttpOnly `accessToken` cookie that the API set at login. The server verifies it with the same `Jwt:Key` and accepts only the role `Organization Manager`. The same cookie is forwarded to the API, so the API stays the one that decides what the manager may do.
* Events: `chat:send {orgId, body}` (ack with the saved message), `chat:read {orgId}` (read ticks), and the pushes `chat:message` and `chat:read`.
* Limits: 2000 characters per message, 20 messages per 10 seconds per connection.

## Run it

1. Run migration `FYP_DB/migrations/012_chat.sql`.
2. Make sure `Chat:ServiceKey` exists in `FYP_BACKEND/fyp_project/appsettings.json` (see `appsettings.example.json`), then restart the backend.
3. In this folder: `npm install`, then `npm run init-env` (creates `.env` from the backend's `appsettings.json`; values are copied, not printed), then `npm start`.
4. Start the frontend as usual (`npm run dev` in `FYP_FRONTEND`; it proxies `/socket.io` to this server).

## Testing before the organization portal exists

The organization side has no login yet. For testing set `CHAT_DEV_TOOLS=true` in `.env` and open **http://localhost:4000/dev**: pick an organization (with its manager), press Connect, and chat as the organization. **Never switch dev tools on in production.**

## Tests

`npm test` starts the server with a fake API (no database needed) and checks sign-in, live delivery to several tabs, read ticks, validation, isolation between organizations and flood protection.
