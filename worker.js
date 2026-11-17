export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/room/")) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", {status:426});
      const room = url.pathname.split("/")[2] || "";
      if (!/^[a-f0-9]{24}$/.test(room)) return new Response("Invalid room", {status:400});
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room {
  constructor(state) { this.state = state; this.sessions = new Map(); }
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, server);
    const broadcast = (data, except) => {
      const message = JSON.stringify(data);
      for (const [id, socket] of this.sessions) {
        if (id !== except) { try { socket.send(message); } catch { this.sessions.delete(id); } }
      }
    };
    const count = () => this.sessions.size;
    server.send(JSON.stringify({type:"peer",count:count()}));
    broadcast({type:"peer",count:count()}, sessionId);
    server.addEventListener("message", event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "hello") {
        broadcast({type:"hello",name:String(msg.name || "Someone").slice(0,24)}, sessionId);
        broadcast({type:"peer",count:count()});
        return;
      }
      if (msg.type === "packet") {
        // Only opaque AES-GCM packets are relayed; plaintext is never handled here.
        if (!msg.packet || typeof msg.packet.iv !== "string" || typeof msg.packet.data !== "string") return;
        broadcast({type:"packet",packet:msg.packet}, sessionId);
        return;
      }
      if (msg.type === "signal") {
        // WebRTC signaling metadata; media itself is protected by WebRTC DTLS-SRTP.
        if (!msg.data || JSON.stringify(msg.data).length > 20000) return;
        broadcast({type:"signal",data:msg.data}, sessionId);
      }
    });
    const cleanup = () => {
      this.sessions.delete(sessionId);
      broadcast({type:"peer",count:count()});
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
    return new Response(null, {status:101, webSocket:client});
  }
}