# Collaborative Canvas

A real-time collaborative drawing application where multiple users can draw together on a shared infinite canvas. Built over 3 days as a learning project to explore WebSocket synchronization and Canvas APIs.

---

## Time Spent

**Total Development Time: ~3 days**


---

## Setup Instructions

Getting started is straightforward. You just need Node.js installed.

### Prerequisites

- Node.js v18 or higher (older versions might work, but haven't tested)
- npm (comes with Node.js)

### Installation

```bash
# Clone the repo
git clone <repository-url>
cd collaborative-canvas

# Install dependencies and start
npm install && npm start
```

That's it! Open `http://localhost:3001` in your browser.

> **Note:** The server runs on port 3001 by default. If you need a different port, set the `PORT` environment variable:
> ```bash
> PORT=8080 npm start
> ```

---

## How to Test with Multiple Users

Testing the collaborative features is easy - you don't need multiple computers.

### Option 1: Multiple Browser Tabs (Easiest)
1. Start the server with `npm start`
2. Open `http://localhost:3001` in your browser
3. Enter a username and room ID (e.g., "test-room")
4. Open the same URL in a new tab or window
5. Enter a different username but the **same room ID**
6. Draw in one tab - you should see it appear in the other instantly!

### Option 2: Multiple Browsers
Open the URL in Chrome AND Firefox simultaneously for a more realistic test.

### Option 3: Local Network Testing
If you want to test with actual different devices:
1. Find your computer's local IP (run `ipconfig` on Windows or `ifconfig` on Mac/Linux)
2. Access `http://<your-ip>:3001` from other devices on the same network

### What to Look For
- Strokes appear on all connected clients instantly
- Ghost cursors show where other users are pointing
- User list updates when people join/leave
- Undo only removes YOUR strokes, not others'
- New users joining see all existing drawings
- Pan around the infinite canvas using the Pan tool or hold Space

---

## Known Limitations and Bugs

I ran into some constraints given the 3-day timeline. Here's what to be aware of:

### Data Persistence
- **No database** - everything is stored in memory. If you restart the server, all drawings are lost. This was a deliberate choice to keep things simple, but it means you can't save your work permanently.

### Authentication
- **No real auth** - users just pick a username. Anyone can join any room if they know the room ID. For a production app, you'd want proper authentication.

### Mobile Support
- **Basic touch support** - I added touch event handlers, but the experience isn't optimized for mobile. Drawing works, but the UI might feel cramped on small screens. Two-finger pan is supported.

### Performance at Scale
- **Not tested with many users** - I've tested with 3-4 simultaneous users and it works fine. Haven't stress-tested with dozens of users in one room. The full-state sync on undo might cause lag with hundreds of strokes.

### Browser Compatibility
- **Modern browsers only** - tested on Chrome and Firefox. Should work on Edge. Probably won't work on IE11.

### Race Conditions
- **Potential edge cases** - if two users complete strokes at the exact same millisecond, the ordering might be slightly inconsistent. In practice, I haven't seen this cause issues.

---

## Features

- **Real-time Drawing Sync** - see other users' strokes appear as they draw
- **Ghost Cursors** - visual indicators showing where others are pointing
- **Infinite Canvas** - pan around freely using the Pan tool or hold Space
- **User-specific Undo/Redo** - undo only affects your own strokes
- **Smooth Lines** - quadratic curve interpolation for nice-looking strokes
- **Room-based Sessions** - create or join different drawing rooms
- **Session Persistence** - rejoin your previous room after refreshing

---

## Drawing Tools

| Tool | Description |
|------|-------------|
| Pen | Freehand drawing |
| Eraser | Erase parts of drawings |
| Line | Draw straight lines |
| Pan | Move around the infinite canvas (or hold Space) |

---

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5 Canvas API, CSS3
- **Backend**: Node.js, Express
- **Real-time**: Socket.io
- **No Drawing Libraries**: Pure Canvas 2D API (wanted to learn how it works)

---

## Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html        # Main UI
│   ├── style.css         # Dark theme styling
│   ├── canvas.js         # Drawing logic with infinite canvas
│   ├── websocket.js      # Socket.io client
│   └── main.js           # App entry point
├── server/
│   ├── server.js         # Express + Socket.io server
│   ├── rooms.js          # Room management
│   └── state-manager.js  # Stroke history and undo/redo
├── package.json
├── README.md
└── ARCHITECTURE.md       # Technical deep-dive
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo your last stroke |
| `Ctrl+Y` | Redo undone stroke |
| `Space` (hold) | Pan mode - click and drag to move canvas |

---

## Deployment

The app can be deployed to platforms that support WebSocket connections:

- **Render** - Recommended, has WebSocket support and free tier

Note: Vercel does not support persistent WebSocket connections, so it won't work there.

---
