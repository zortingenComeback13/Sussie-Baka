
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { IncomingMessage } from 'http';

// The socket server acts as a Discovery Service and Signaling Server.

interface Lobby {
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    lastHeartbeat: number;
}

const wss = new WebSocketServer({ port: 8080 });
const lobbies = new Map<string, Lobby>();
const onlinePlayers = new Map<string, WsWebSocket>();

console.log('--------------------------------------------------');
console.log('SUSSIE BAKA P2P DISCOVERY & SIGNALING SERVER RUNNING ON PORT 8080');
console.log('--------------------------------------------------');

// Prune stale lobbies and disconnected players
setInterval(() => {
    const now = Date.now();
    lobbies.forEach((lobby, code) => {
        if (now - lobby.lastHeartbeat > 10000) { // 10s timeout
            // console.log(`[PRUNE] Removed stale lobby ${code}`);
            lobbies.delete(code);
        }
    });
}, 5000);

wss.on('connection', (ws: WsWebSocket, req: IncomingMessage) => {
    let myName: string | null = null;

    ws.on('message', (message: any) => {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'REGISTER_PLAYER':
                    if (data.name) {
                        myName = data.name;
                        onlinePlayers.set(data.name, ws);
                    }
                    break;

                case 'REGISTER_LOBBY':
                    lobbies.set(data.code, {
                        code: data.code,
                        hostName: data.hostName,
                        playerCount: data.playerCount,
                        maxPlayers: data.maxPlayers,
                        lastHeartbeat: Date.now()
                    });
                    break;
                    
                case 'GET_LOBBIES':
                    const list = Array.from(lobbies.values()).map(l => ({
                        id: l.code,
                        host: l.hostName,
                        count: l.playerCount,
                        max: l.maxPlayers
                    }));
                    ws.send(JSON.stringify({ type: 'LOBBY_LIST', lobbies: list }));
                    break;

                case 'SEND_INVITE':
                    const targetWs = onlinePlayers.get(data.targetName);
                    if (targetWs && targetWs.readyState === WsWebSocket.OPEN) {
                        targetWs.send(JSON.stringify({
                            type: 'INVITE_RECEIVED',
                            hostName: data.hostName,
                            roomCode: data.roomCode
                        }));
                    }
                    break;

                case 'FRIEND_REQUEST':
                    const friendWs = onlinePlayers.get(data.to);
                    if (friendWs && friendWs.readyState === WsWebSocket.OPEN) {
                        friendWs.send(JSON.stringify({
                            type: 'FRIEND_REQUEST_RECEIVED',
                            from: data.from
                        }));
                    }
                    break;

                case 'FRIEND_ACCEPT':
                    const requesterWs = onlinePlayers.get(data.to);
                    if (requesterWs && requesterWs.readyState === WsWebSocket.OPEN) {
                        requesterWs.send(JSON.stringify({
                            type: 'FRIEND_ACCEPTED',
                            from: data.from
                        }));
                    }
                    break;
            }
        } catch (e) {
            console.error("Invalid msg", e);
        }
    });

    ws.on('close', () => {
        if (myName) onlinePlayers.delete(myName);
    });
});
