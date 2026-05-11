# User Lifecycle Flows

## First Open

1. Browser loads the Vue app.
2. App loads runtime config from `/api/config`.
3. App gets or creates a browser `deviceId`.
4. App loads demo users from server if reachable, or cached users from IndexedDB if not.
5. App connects to Socket.IO with `client:hello`.
6. Server stores the socket session as `{ userId, deviceId, localOnly }`.
7. Server returns `chat:list` for the selected user.
8. Server sends a peer directory for online/local-only users who share active chats with this user.
9. App caches visible chats/messages in IndexedDB.
10. App retries pending local events after the socket is connected.

Expected UI:

- connection label becomes connected when Socket.IO is ready
- chat list appears from server or cache
- pending count is recalculated from IndexedDB

## User Switch

1. User selects a different demo user.
2. Current user id is stored in `localStorage`.
3. Browser peer connections are reset so the old user's WebRTC graph is not reused.
4. Socket sends a new `client:hello` for the selected user.
5. Server removes the socket from the old user's socket map and chat rooms.
6. Server joins the socket to the new user's active chat rooms.
7. Server recalculates that user's peer directory.
8. App refreshes chat list and active messages for the new user.
9. Peer targets are recalculated from the server peer directory and the new user's active chat members.

Important:

- this is demo user switching, not real authentication
- a production app must replace it with real auth/session identity
- user switching must reset peer state, otherwise a browser window that was Kate can keep stale peer links after it becomes Ivan

## Refresh

1. Browser reloads the app.
2. Existing `deviceId` and selected user are reused.
3. Cached data may render before or while network data loads.
4. Socket.IO reconnects.
5. Pending events in IndexedDB are retried automatically.

Result:

- central-synced data comes from server
- unsynced local events from this browser are retried
- data from another closed browser cannot be recovered by this browser

## Close While Connected

1. User closes the tab while connected.
2. Server receives socket disconnect.
3. Presence is updated for other open users.
4. Already central-synced events remain in central SQLite.

Result:

- no special warning is needed
- reopening loads central data again

## Close While Local-Only

1. User enters local-only mode.
2. User creates chats/messages.
3. Events are saved in browser IndexedDB.
4. User tries to close or refresh.
5. App triggers a `beforeunload` warning.

Browser limitation:

Modern browsers usually ignore custom warning text and show their own generic message.

If the user closes anyway:

- local events stay in this browser profile
- connected receivers do not get those events unless they were already reached by WebRTC
- not connected users receive nothing until this browser opens and syncs later

## Reopen After Local-Only Close

1. Same browser profile opens the app again.
2. IndexedDB still contains pending local events.
3. Socket.IO connects to central/helper.
4. `retryPending()` sends pending events.
5. Server accepts new events or returns existing events for duplicates.
6. Browser marks events as sent to central/helper.

Result:

- automatic sync works from the same browser/device
- if IndexedDB was cleared, incognito was closed, or another browser is opened, the unsynced events are not available

## Server Restart

1. Server process stops.
2. SQLite database file remains on disk.
3. Server starts again with the same `DATABASE_PATH`.
4. Existing chats/messages are loaded from SQLite.
5. Browsers reconnect and refresh state.

Result:

- chats are not deleted by process restart
- chats are lost only if the database file is removed or a different database path is used
