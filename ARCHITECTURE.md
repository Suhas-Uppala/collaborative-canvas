# Architecture Documentation

This document explains how the Collaborative Canvas works under the hood. I'm writing this partly as documentation and partly to organize my own thoughts after building it.

---

## Overview

The app follows a pretty standard client-server architecture. Users connect to a Node.js server via WebSockets, and the server broadcasts drawing events to everyone in the same room.

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT BROWSERS                          │
├───────────────────┬───────────────────┬─────────────────────┤
│      User A       │      User B       │      User C         │
│   ┌───────────┐   │   ┌───────────┐   │   ┌───────────┐     │
│   │  Canvas   │   │   │  Canvas   │   │   │  Canvas   │     │
│   │  Module   │   │   │  Module   │   │   │  Module   │     │
│   └─────┬─────┘   │   └─────┬─────┘   │   └─────┬─────┘     │
│         │         │         │         │         │           │
│   ┌─────┴─────┐   │   ┌─────┴─────┐   │   ┌─────┴─────┐     │
│   │ WebSocket │   │   │ WebSocket │   │   │ WebSocket │     │
│   └─────┬─────┘   │   └─────┬─────┘   │   └─────┬─────┘     │
└─────────┼─────────┴─────────┼─────────┴─────────┼───────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    Socket.io Connections
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                      NODE.JS SERVER                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│   │   Express   │   │  Socket.io  │   │  Static Files   │   │
│   │   Server    │───│   Handler   │   │  (client/*.*)   │   │
│   └─────────────┘   └──────┬──────┘   └─────────────────┘   │
│                            │                                 │
│              ┌─────────────┴─────────────┐                  │
│              │                           │                  │
│       ┌──────┴──────┐             ┌──────┴──────┐          │
│       │    Rooms    │             │    State    │          │
│       │   Manager   │             │   Manager   │          │
│       │             │             │             │          │
│       │ - User Map  │             │ - Strokes[] │          │
│       │ - Sessions  │             │ - Redo Stack│          │
│       └─────────────┘             └─────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

This is probably the most important thing to understand. Here's how a drawing action flows through the system:

### When User A Draws Something

```
User A's Browser                    Server                    Other Users
      │                               │                            │
      │ 1. mousedown                  │                            │
      │    (start collecting points)  │                            │
      │                               │                            │
      │ 2. mousemove (every ~16ms)    │                            │
      ├──────── drawing_step ────────>│                            │
      │    {points, color, width}     │                            │
      │                               │                            │
      │                               ├──── drawing_update ───────>│
      │                               │   (for real-time preview)  │ 3. Render preview
      │                               │                            │
      │ 4. mouseup                    │                            │
      ├──────── stroke_complete ─────>│                            │
      │    {all points, color, width} │                            │
      │                               │                            │
      │                               │ 5. Server adds strokeId,   │
      │                               │    userId, timestamp       │
      │                               │                            │
      │                               │ 6. Save to strokes[]       │
      │                               │                            │
      │                               ├──── stroke_received ──────>│
      │                               │   (complete stroke data)   │ 7. Render final stroke
      │                               │                            │
```

The key insight here is that we send two types of messages:
- **`drawing_step`**: Sent frequently while drawing, for real-time preview. These are NOT saved.
- **`stroke_complete`**: Sent once when the user lifts their mouse. This IS saved.

This separation means other users see a live preview of what's being drawn, but we only persist the final result.

### When a New User Joins

```
New User                            Server
    │                                 │
    ├──────── join_room ─────────────>│
    │   {roomId, userName}            │
    │                                 │ 1. Create session
    │                                 │    (assign color, userId)
    │                                 │
    │<─────── session_created ────────┤
    │   {userId, color, roomId}       │
    │                                 │
    │<─────── sync_strokes ───────────┤
    │   [all existing strokes]        │ 2. Send complete state
    │                                 │
    │<─────── users_list ─────────────┤
    │   [all current users]           │
    │                                 │
    │                                 ├──── user_joined ──────> Others
    │                                 │                            │
```

---

## WebSocket Protocol

Here's the complete list of messages the client and server exchange. I'm using Socket.io, which handles the WebSocket connection and provides nice features like automatic reconnection.

### Messages the Client Sends

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{roomId, userName}` | Join a drawing room |
| `stroke_complete` | `{points, color, width}` | Finished drawing a stroke |
| `drawing_step` | `{points, color, width}` | Live drawing preview (while mouse is down) |
| `cursor_move` | `{x, y}` | Current cursor position |
| `undo_stroke` | *(none)* | Undo last own stroke |
| `redo_stroke` | *(none)* | Redo previously undone stroke |
| `clear_canvas` | *(none)* | Clear all drawings in room |

### Messages the Client Receives

| Event | Payload | Description |
|-------|---------|-------------|
| `session_created` | `{userId, userName, color, roomId}` | Your session info after joining |
| `sync_strokes` | `[Stroke, ...]` | Full state sync (on join or after undo) |
| `users_list` | `[User, ...]` | List of users currently in room |
| `user_joined` | `{userId, userName, color}` | Someone joined the room |
| `user_left` | `{userId, userName}` | Someone left the room |
| `stroke_received` | `Stroke` | New stroke from another user |
| `drawing_update` | `{userId, points, ...}` | Live drawing preview from another user |
| `cursor_update` | `{userId, userName, color, position}` | Another user's cursor moved |
| `canvas_cleared` | *(none)* | Canvas was cleared by someone |

### Data Structures

**Stroke Object:**
```json
{
  "strokeId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-uuid",
  "userName": "Alice",
  "color": "#FF6B6B",
  "width": 5,
  "points": [
    {"x": 100, "y": 150},
    {"x": 102, "y": 153},
    {"x": 105, "y": 158}
  ],
  "timestamp": 1704067200000
}
```

**Cursor Update Object:**
```json
{
  "userId": "user-uuid",
  "userName": "Alice",
  "color": "#FF6B6B",
  "position": {"x": 250, "y": 300}
}
```

---

## Undo/Redo Strategy

This was one of the trickier parts to get right. In a single-user drawing app, undo is simple - just pop the last stroke. But with multiple users, whose stroke do you undo?

### My Approach: User-Specific Undo

I decided that **undo should only affect your own strokes**. If Alice and Bob are drawing, and Alice hits Ctrl+Z, only Alice's most recent stroke gets removed - Bob's work stays intact.

Here's how it works:

```
Alice's View                Server                       Bob's View
    │                         │                              │
    │ Alice presses Ctrl+Z    │                              │
    ├──── undo_stroke ───────>│                              │
    │                         │                              │
    │                         │ 1. Find strokes[]            │
    │                         │    [Bob1, Alice1, Bob2,      │
    │                         │     Alice2, Bob3]            │
    │                         │                              │
    │                         │ 2. Search from end for       │
    │                         │    stroke where              │
    │                         │    userId === Alice          │
    │                         │    → Found: Alice2           │
    │                         │                              │
    │                         │ 3. Remove Alice2 from        │
    │                         │    strokes[]                 │
    │                         │                              │
    │                         │ 4. Push Alice2 to            │
    │                         │    Alice's redo stack        │
    │                         │                              │
    │<─── sync_strokes ───────┼──── sync_strokes ───────────>│
    │   [Bob1, Alice1, Bob2, Bob3]                           │
    │                         │                              │
    │ 5. Redraw canvas        │                 5. Redraw canvas
```

### Why Full State Sync?

You'll notice I send `sync_strokes` (the entire stroke array) instead of just "remove stroke X". This is intentional:

1. **Simplicity** - The client just clears and redraws everything. No complex state management.
2. **Consistency** - If a message gets lost, the next sync fixes it.
3. **Debugging** - Easy to see exactly what state each client has.

The downside is bandwidth - with hundreds of strokes, this could be slow. For a 3-day project, I decided correctness beats optimization.

### Per-User Redo Stacks

Each user has their own redo stack, stored on the server:

```javascript
redoStacks = Map<roomId, Map<userId, Stroke[]>>
```

When Alice undoes a stroke, it goes onto Alice's redo stack. When she hits redo, it comes back. If Alice draws something new after undoing, her redo stack gets cleared (standard undo behavior).

---

## Performance Decisions

Here's why I made certain choices to keep things smooth:

### 1. Throttled Drawing Events

The naive approach would be to emit a WebSocket message on every `mousemove` event. But `mousemove` can fire 100+ times per second on a fast mouse. That's way too much network traffic.

Instead, I throttle to ~60fps (every 16ms):

```javascript
const EMIT_INTERVAL = 16;
let lastEmit = 0;

function onMouseMove(event) {
  const now = Date.now();
  if (now - lastEmit > EMIT_INTERVAL) {
    socket.emit('drawing_step', currentStroke);
    lastEmit = now;
  }
}
```

This feels instantaneous to users but reduces network traffic by ~40%.

### 2. Cursor Updates at 30fps

Ghost cursors don't need to be as smooth as drawing, so I throttle those even more:

```javascript
const CURSOR_INTERVAL = 33; // ~30fps
```

### 3. Separate "Live Preview" vs "Final Stroke"

Instead of broadcasting every point individually, I accumulate points locally and send them in batches. The final `stroke_complete` message contains all points, which the server saves.

Other users see:
- Live preview (from `drawing_step`) - rendered but not saved
- Final stroke (from `stroke_complete`) - replaces the preview

### 4. Quadratic Bézier Curves

Raw mouse points look jagged. I use quadratic curves to smooth them:

```javascript
ctx.beginPath();
ctx.moveTo(points[0].x, points[0].y);

for (let i = 1; i < points.length - 1; i++) {
  // Control point is the current point
  // End point is midway between current and next
  const xc = (points[i].x + points[i + 1].x) / 2;
  const yc = (points[i].y + points[i + 1].y) / 2;
  ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
}

ctx.stroke();
```

This gives smooth, natural-looking lines without needing more points.

### 5. High-DPI Canvas Scaling

On retina displays, the canvas looks blurry without proper scaling:

```javascript
const dpr = window.devicePixelRatio || 1;
canvas.width = containerWidth * dpr;
canvas.height = containerHeight * dpr;
ctx.scale(dpr, dpr);
```

---

## Conflict Resolution

In a collaborative app, things can get messy. Here's how I handle the main conflicts:

### Simultaneous Drawing

**Problem:** Alice and Bob are both drawing at the same time. Who "wins"?

**Solution:** Everyone wins! There's no conflict because each stroke is independent. Both strokes get saved with timestamps, and both appear on everyone's canvas. The order might differ by a few milliseconds, but visually it doesn't matter.

### Stroke Order Consistency

**Problem:** Due to network latency, Alice might see strokes in order [A, B, C] while Bob sees [A, C, B].

**Solution:** I currently don't enforce strict ordering. Strokes are appended as they arrive. In practice, this hasn't been noticeable because:
1. Strokes render on top of each other, so order rarely matters visually
2. The full sync on undo/redo acts as a correction mechanism

For a production app, you'd want vector clocks or CRDTs. For this project, "good enough" works.

### Undo During Someone Else's Drawing

**Problem:** Alice undoes while Bob is mid-stroke. Does Bob see a confusing state?

**Solution:** The `sync_strokes` message only includes completed strokes. Bob's in-progress stroke is still being collected locally and hasn't been saved yet. So the sync doesn't affect it.

### Clear Canvas Conflicts

**Problem:** Alice clears the canvas while Bob is drawing.

**Solution:** Bob's current stroke is lost (his local state is cleared). This is arguably correct behavior - if someone clears, they clear everything. Could add confirmation dialogs, but didn't have time.

### Disconnection and Reconnection

**Problem:** A user's connection drops and reconnects.

**Solution:** Socket.io handles reconnection automatically. On reconnect, the user rejoins the room and gets a fresh `sync_strokes` with the current state. Any strokes they drew before disconnecting are preserved on the server.

---

## What I'd Do Differently With More Time

1. **Persistent Storage** - Add Redis or a database so drawing survives server restarts
2. **Operational Transform or CRDTs** - Proper conflict resolution instead of "last one wins"
3. **Lazy Canvas Rendering** - Only redraw the affected region, not the entire canvas
4. **Undo History Limit** - Currently unlimited, could cause memory issues
5. **Chunk Large Syncs** - Sending 1000 strokes at once could choke the connection
6. **Canvas Layers** - Let users draw on separate layers
7. **Binary Protocol** - JSON is verbose; MessagePack or protobufs would be smaller

---

## Security Considerations

This is a toy project, but I tried to be sensible:

1. **Input Validation** - Strokes are validated on the server before saving
2. **Room Isolation** - Socket.io rooms ensure users only get events from their room
3. **No Persistence** - Data is in-memory only, so nothing survives a restart (feature or bug depending on perspective)
4. **Rate Limiting** - Socket.io has built-in reconnection throttling

What's missing that a production app would need:
- Authentication (anyone can impersonate anyone)
- Authorization (anyone can join any room)
- Input sanitization (XSS via username?)
- HTTPS in production
