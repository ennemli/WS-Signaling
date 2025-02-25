
import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map<number, WebSocket>();
wss.on("connection", (ws: WebSocket) => {
  const clientID = Date.now();

  clients.set(clientID, ws);

  console.log(`Client connected ${clientID}`);

  // Inform client connected with ClientID
  ws.send(JSON.stringify({
    type: "connect",
    clientID,
    peers: Array.from(clients.keys()).filter(id => id !== clientID)
  }));

  // Inform peers a new client has connected
  clients.forEach((client, id) => {
    if (id != clientID && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "new-peer",
        peerID: clientID
      }));
    }
  });

  ws.on("message", (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);

      console.log(`Received ${parsedMessage.type} from client ${clientID}`);
      if (parsedMessage) {
        if (parsedMessage.target && clients.has(parsedMessage.target)) {
          const targetClient = clients.get(parsedMessage.target)!;
          parsedMessage.sender = clientID;
          if (targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(JSON.stringify(parsedMessage));
            console.log(`Forwared ${parsedMessage.type} to client ${parsedMessage.target}`);
          }
        }
      }
    } catch (error) {
      console.error("Error handling message", error);
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${clientID}`);
    clients.delete(clientID);
    clients.forEach((client, id) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "peer-disconnected",
          peerID: clientID
        }));

      }
    });
  });

  ws.on("error", (error: Error) => {
    console.error(`Client ${clientID} error: ${error}`);
  });

});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebRTC signaling server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}`);
});
