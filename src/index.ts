
import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { URL } from 'url';

type WSKeyType = {
  id: number;
  role: 'streamer' | 'consumer';
};


const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });


const consumers = new Map<WSKeyType, WebSocket>();
const streamers = new Map<WSKeyType, WebSocket>();

const send = (ws: WebSocket, message: any) => {
  ws.send(JSON.stringify(message));
}

wss.on("connection", (ws, req) => {
  if (!req.url) {
    ws.terminate();
    return;
  }
  console.log(req.url)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const params = new URLSearchParams(url.search);

  const role = params.get("role");

  if (role === "streamer" || role === "consumer") {
    const id = Date.now();

    if (role === 'streamer') {
      streamers.set({
        id,
        role
      }, ws);
      // Inform Streamer its connection
      ws.send(JSON.stringify(
        {
          type: "connect",
          id,
          role
        }));
      consumers.forEach((consumer) => {
        send(consumer, {
          type: "new-streamer",
          streamer_id: id
        });
      });
    } else {
      consumers.set({
        id,
        role
      }, ws);
      // Inform consumer its connection with available servers
      send(ws, {
        type: "connect",
        id,
        role,
        streamers: [...streamers.keys()].map(({ id }) => id)
      });
    }

    console.log(`${role} connected ${id}`);


    ws.on("message", (message: string) => {
      try {
        const parsedMessage = JSON.parse(message);

        let sessions: Map<WSKeyType, WebSocket>;

        if (role == 'streamer') {
          sessions = streamers;

        } else {
          sessions = consumers;
        }

        console.log(`Received ${parsedMessage.type} from ${role} ${id}}`);
        if (parsedMessage && parsedMessage.target && sessions.has(parsedMessage.target)) {
          const targetSession = sessions.get(parsedMessage.target)!;

          if (targetSession.readyState === WebSocket.OPEN) {
            parsedMessage.sender = id;
            send(targetSession, parsedMessage);
            console.log(`Forwared ${parsedMessage.type} to ${parsedMessage.target}`);
          }
        }
      } catch (error) {
        console.error("Error handling message", error);
      }
    });

    ws.on("close", () => {
      console.log(`${role} disconnected: ${id}`);
      if (role === 'consumer') {
        consumers.delete({ role, id });
        streamers.forEach((streamer) => {
          send(streamer, {
            type: "consumer-disconnected",
            consumerId: id,
          })
        });
      }
    });

    ws.on("error", (error: Error) => {
      console.error(`${role} ${id} error: ${error}`);
    });

  } else {
    ws.terminate();
  }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebRTC signaling server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}`);
});
