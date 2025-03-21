import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { URL } from 'url';

type WSKeyType = number; // WSKeyType is now a number

interface Session {
  ws: WebSocket;
  role: "streamer" | "consumer";
  id: number;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const sessions = new Map<WSKeyType, Session>();

const send = (ws: WebSocket, message: any) => {
  ws.send(JSON.stringify(message));
};

wss.on("connection", (ws, req) => {
  if (!req.url) {
    ws.terminate();
    return;
  }
  console.log(req.url);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const params = new URLSearchParams(url.search);

  const role = params.get("role");

  if (role === "streamer" || role === "consumer") {
    const id = Date.now();
    const sessionKey = id; // Use id directly as key (number)

    const session: Session = {
      ws,
      role,
      id,
    };

    sessions.set(sessionKey, session);

    // Inform the client about its connection
    if (role === "streamer") {
      // Inform consumers about the new streamer
      send(ws, {
        type: "connect",
        id,
      });


      sessions.forEach((s) => {
        if (s.role === "consumer") {
          send(s.ws, {
            type: "new-streamer",
            streamer_id: id,
          });
        }
      });
    } else {
      // Inform the consumer about available streamers
      const streamerIds = [...sessions.values()]
        .filter((s) => s.role === "streamer")
        .map((s) => s.id);

      send(ws, {
        type: "connect",
        id,
        streamers: streamerIds,
      });
    }

    console.log(`${role} connected ${id}`);

    ws.on("message", (message: string) => {
      try {
        const parsedMessage = JSON.parse(message);

        console.log(`Received ${parsedMessage.type} from ${role} ${id} to ${parsedMessage.target}`);

        if (parsedMessage && parsedMessage.target) {
          const targetSession = sessions.get(parsedMessage.target); // target is now just id which is a number

          if (targetSession && targetSession.ws.readyState === WebSocket.OPEN) {
            parsedMessage.sender = id;
            send(targetSession.ws, parsedMessage);
            console.log(`Forwarded ${parsedMessage.type} to ${parsedMessage.target}`);
          }
        }
      } catch (error) {
        console.error("Error handling message", error);
      }
    });

    ws.on("close", () => {
      console.log(`${role} disconnected: ${id}`);
      sessions.delete(sessionKey);

      if (role === "consumer") {
        sessions.forEach((s) => {
          if (s.role === "streamer") {
            send(s.ws, {
              type: "consumer-disconnected",
              consumer_id: id,
            });
          }
        });
      } else {
        sessions.forEach((s) => {
          if (s.role === "consumer") {
            send(s.ws, {
              type: "streamer-disconnected",
              streamer_id: id,
            });
          }
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
