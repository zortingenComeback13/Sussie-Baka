import React, { useEffect, useRef, useState } from 'react';
import { GameState, Player, PlayerColor, PlayerRole, Point, Task, ChatMessage, LobbySettings, SabotageType, UserProgress, GameAudioSettings } from '../types';
import { WALLS, PLAYER_SPEED, MAP_WIDTH, MAP_HEIGHT, COLORS, INTERACT_RADIUS, KILL_RADIUS, VIEW_RADIUS, EMERGENCY_BUTTON, TASKS_TEMPLATE, DEFAULT_SETTINGS, VENTS, ACHIEVEMENTS } from '../constants';
import { resolveCollision, distance, getClosestPlayer } from '../services/gameLogic';
import { Skull, AlertTriangle, Play, Settings, Send, MessageSquare, XCircle, LogOut, Zap, Flame, Map as MapIcon, Trash2, Loader2, Copy, Check, UserPlus, Mail, X, Star, Trophy, Hand } from 'lucide-react';
import { audio } from '../services/audioManager';

interface GameEngineProps {
  playerName: string;
  playerColor: PlayerColor;
  roomCode: string;
  isHost: boolean;
  onLeave: () => void;
  gameMode: 'FREEPLAY' | 'ONLINE' | 'P2P';
  initialRole?: PlayerRole;
  serverUrl?: string;
}

interface BotState {
    id: string;
    targetTaskId?: string;
    state: 'IDLE' | 'MOVING' | 'DOING_TASK';
    timer: number;
    targetPos?: Point;
}

interface PlayerTarget {
    x: number;
    y: number;
    facingRight: boolean;
    timestamp: number;
}

const SABOTAGE_LOCATIONS: Record<SabotageType, Point> = {
    [SabotageType.LIGHTS]: { x: 1000, y: 1000 },
    [SabotageType.REACTOR]: { x: 200, y: 600 },
    [SabotageType.O2]: { x: 1900, y: 525 },
    [SabotageType.NONE]: { x: 0, y: 0 }
};

export const GameEngine: React.FC<GameEngineProps> = ({ playerName, playerColor, roomCode: initialRoomCode, isHost: initialIsHost, onLeave, gameMode, initialRole, serverUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // -- REFS --
  const gameStateRef = useRef<GameState>(GameState.LOBBY);
  const playersRef = useRef<Player[]>([]);
  const playerTargetsRef = useRef<Map<string, PlayerTarget>>(new Map()); 
  const myIdRef = useRef<string>('');
  const tasksRef = useRef<Task[]>([]);
  const killCooldownRef = useRef<number>(10);
  const sabotageRef = useRef<{type: SabotageType, timer: number}>({ type: SabotageType.NONE, timer: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const botStates = useRef<Map<string, BotState>>(new Map());
  const touchJoystick = useRef<{active: boolean, origin: Point, current: Point}>({ active: false, origin: {x:0, y:0}, current: {x:0, y:0} });
  const lobbyWs = useRef<WebSocket | null>(null);
  
  // State Refs for Loop Access
  const settingsRef = useRef<LobbySettings>(DEFAULT_SETTINGS);
  
  // Key handling refs (for debounce/single trigger)
  const prevKeyURef = useRef<boolean>(false);
  const prevKeyRRef = useRef<boolean>(false);
  const prevKeyKRef = useRef<boolean>(false);

  // UI Refs for loop
  const showMapRef = useRef(false);

  // P2P Refs
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 

  // -- STATE --
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [isHost, setIsHost] = useState(initialIsHost);
  const [players, setPlayers] = useState<Player[]>([]); 
  const [myId, setMyId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]); 
  
  // UI States managed by loop
  const [canUse, setCanUse] = useState(false);
  const [canReport, setCanReport] = useState(false);
  const [canKill, setCanKill] = useState(false);
  const [nearbyTarget, setNearbyTarget] = useState<Player | null>(null);
  const [killCooldownDisplay, setKillCooldownDisplay] = useState(10);
  
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [meetingTimer, setMeetingTimer] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [winner, setWinner] = useState<'CREWMATE' | 'IMPOSTOR' | null>(null);
  const [voteResults, setVoteResults] = useState<any>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [isConnected, setIsConnected] = useState(gameMode === 'FREEPLAY');
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<LobbySettings>(DEFAULT_SETTINGS);
  const [sabotageDisplay, setSabotageDisplay] = useState<{type: SabotageType, timer: number}>({ type: SabotageType.NONE, timer: 0 });
  
  // End Game Stats
  const [xpGained, setXpGained] = useState(0);
  const [trophiesGained, setTrophiesGained] = useState(0);
  const [questsCompleted, setQuestsCompleted] = useState<string[]>([]);
  
  // UI Toggles
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [fixingSabotage, setFixingSabotage] = useState<SabotageType | null>(null);
  const [lightsSwitches, setLightsSwitches] = useState<boolean[]>([false, false, false, false, false]);
  const [sabotageFixProgress, setSabotageFixProgress] = useState(0);

  const me = players.find(p => p.id === myId);

  // Sync Refs
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // -- HOST DISCOVERY & INVITE --
  useEffect(() => {
      if (serverUrl) {
          try {
              const ws = new WebSocket(serverUrl);
              lobbyWs.current = ws;
              ws.onopen = () => {
                  ws.send(JSON.stringify({ type: 'REGISTER_PLAYER', name: playerName }));
                  if (gameMode === 'P2P' && isHost) {
                      ws.send(JSON.stringify({
                          type: 'REGISTER_LOBBY',
                          code: initialRoomCode,
                          hostName: playerName,
                          playerCount: players.length,
                          maxPlayers: settings.maxPlayers
                      }));
                  }
              };
              
              const interval = setInterval(() => {
                  if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'REGISTER_PLAYER', name: playerName }));
                      // Constantly re-register lobby to keep it alive on discovery server
                      if (gameMode === 'P2P' && isHost) {
                          ws.send(JSON.stringify({
                              type: 'REGISTER_LOBBY',
                              code: initialRoomCode,
                              hostName: playerName,
                              playerCount: playersRef.current.length,
                              maxPlayers: settings.maxPlayers
                          }));
                      }
                  }
              }, 3000);
              
              return () => { clearInterval(interval); ws.close(); };
          } catch(e) {}
      }
  }, [gameMode, isHost, serverUrl]);

  // -- LOGIC --
  useEffect(() => {
      let interval: any;
      if (gameState === GameState.MEETING && !voteResults) {
          interval = setInterval(() => {
              setMeetingTimer(prev => {
                  if (prev <= 1) {
                      if (gameMode === 'FREEPLAY' || (gameMode === 'P2P' && isHost)) {
                          endMeetingP2P(votes);
                      }
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [gameState, voteResults, gameMode, isHost, votes]);

  const updateGameState = (newState: GameState) => { setGameState(newState); gameStateRef.current = newState; };
  const updatePlayers = (newPlayers: Player[]) => { setPlayers(newPlayers); playersRef.current = newPlayers; };
  const updateMyId = (id: string) => { setMyId(id); myIdRef.current = id; };
  const updateTasks = (newTasks: Task[]) => { setTasks(newTasks); tasksRef.current = newTasks; };
  const updateSettings = (newSettings: LobbySettings) => { 
      setSettings(newSettings);
      if (isHost && gameMode === 'P2P') {
          broadcastP2P({ type: 'SETTINGS_UPDATE', settings: newSettings });
      }
  };

  useEffect(() => {
    if (gameMode === 'FREEPLAY') initializeFreeplay();
    else if (gameMode === 'P2P') initializeP2P();
    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const sendP2P = (msg: any) => { if (!isHost && connectionsRef.current[0]) connectionsRef.current[0].send(msg); };
  const broadcastP2P = (msg: any) => { if (isHost) connectionsRef.current.forEach(c => { if (c.open) c.send(msg); }); };

  const initializeP2P = () => {
      // @ts-ignore
      const Peer = (window as any).Peer;
      if (!Peer) { alert("PeerJS library not loaded"); onLeave(); return; }
      
      const peerId = `sb-game-${initialRoomCode}`;
      const id = initialIsHost ? peerId : undefined;
      
      const peer = new Peer(id);
      peerRef.current = peer;
      
      peer.on('open', (pid: string) => {
          setIsConnected(true);
          const localId = 'p_' + Math.floor(Math.random() * 1000000);
          updateMyId(localId);
          
          const storedId = localStorage.getItem('sb_user_id') || 'default';
          const progress: UserProgress = JSON.parse(localStorage.getItem(`sb_progress_${storedId}`) || '{}');
          
          if (initialIsHost) {
              const me: Player = { id: localId, name: playerName, color: playerColor, x: 1200, y: 300, vx: 0, vy: 0, role: PlayerRole.CREWMATE, isDead: false, isBodyReported: false, isHost: true, facingRight: true, hat: progress.equippedHat, skin: progress.equippedSkin, pet: progress.equippedPet };
              updatePlayers([me]);
              updateGameState(GameState.LOBBY);
          } else {
              // Connect to the specific Host ID based on Room Code
              const conn = peer.connect(peerId);
              
              conn.on('open', () => { 
                  connectionsRef.current = [conn]; 
                  conn.send({ type: 'JOIN', name: playerName, color: playerColor, playerId: localId, hat: progress.equippedHat, skin: progress.equippedSkin, pet: progress.equippedPet }); 
              });
              
              conn.on('data', (data: any) => handleP2PMessageClient(data));
              
              conn.on('close', () => { 
                  alert("Host disconnected"); 
                  onLeave(); 
              });
              
              // Fallback/Timeout if connection fails
              setTimeout(() => {
                  if(!conn.open) { 
                      alert("Could not connect to lobby. Room code might be invalid or host is offline.");
                      onLeave();
                  }
              }, 5000);
          }
      });
      
      peer.on('connection', (conn: any) => { 
          if (initialIsHost) { 
              connectionsRef.current.push(conn); 
              conn.on('data', (data: any) => handleP2PMessageHost(data, conn)); 
          } 
      });
      
      peer.on('error', (err: any) => { 
          if (err.type === 'unavailable-id') { 
              alert("Room code is already active or taken. Try another."); 
          } else {
              alert("Connection Error: " + err.type); 
          }
          onLeave(); 
      });
  };

  const handleP2PMessageClient = (data: any) => {
      switch (data.type) {
          case 'JOIN_SUCCESS': setRoomCode(data.room); updatePlayers(data.players); setSettings(data.settings); break;
          case 'PLAYER_JOINED': updatePlayers([...playersRef.current.filter(p=>p.id !== data.player.id), data.player]); break;
          case 'SETTINGS_UPDATE': setSettings(data.settings); break;
          case 'GAME_STATE_UPDATE': 
              data.players.forEach((p: Player) => { if (p.id !== myIdRef.current) playerTargetsRef.current.set(p.id, { x: p.x, y: p.y, facingRight: p.facingRight, timestamp: Date.now() }); });
              playersRef.current = playersRef.current.map(curr => { const update = data.players.find((up: Player) => up.id === curr.id); return update ? { ...curr, ...update, x: curr.x, y: curr.y } : curr; });
              break;
          case 'GAME_STARTED': updatePlayers(data.players); if (data.players.find((p: Player) => p.id === myIdRef.current)?.role === PlayerRole.CREWMATE) { const myTasks = [...TASKS_TEMPLATE].sort(() => 0.5 - Math.random()).slice(0, data.settings.taskCount).map(t => ({ ...t, completed: false })); updateTasks(myTasks); } else updateTasks([]); setKillCooldown(data.settings.killCooldown); setSabotage(SabotageType.NONE, 0); setShowRoleReveal(true); updateGameState(GameState.REVEAL); setTimeout(() => { setShowRoleReveal(false); updateGameState(GameState.PLAYING); }, 3000); break;
          case 'MEETING_STARTED': 
              audio.playReport();
              updatePlayers(data.players); startMeetingLocal(false); 
              break;
          case 'VOTE_UPDATE': setVotes(prev => ({ ...prev, [data.voterId]: data.targetId })); break;
          case 'MEETING_ENDED': setVoteResults(data.results); setTimeout(() => { setVoteResults(null); updatePlayers(data.players); playerTargetsRef.current.clear(); updateGameState(GameState.PLAYING); }, 4000); break;
          case 'PLAYER_KILLED': 
              const v = playersRef.current.find(p=>p.id===data.targetId);
              if(v && distance(v, playersRef.current.find(p=>p.id===myIdRef.current)!) < VIEW_RADIUS) audio.playKill();
              updatePlayers(playersRef.current.map(p => p.id === data.targetId ? { ...p, isDead: true, deathX: p.x, deathY: p.y } : p)); 
              break;
          case 'SABOTAGE_UPDATE': setSabotage(data.sabotage, data.timer); if (data.sabotage === SabotageType.NONE) setFixingSabotage(null); break;
          case 'TASK_PROGRESS': setTaskProgress(data.progress); break;
          case 'CHAT_MESSAGE': setChatMessages(prev => [...prev, data.message]); scrollToBottom(); break;
          case 'GAME_OVER': handleGameOver(data.winner); break;
      }
  };

  const handleP2PMessageHost = (data: any, conn: any) => {
      switch (data.type) {
          case 'JOIN': 
              let finalName = data.name; let count = 2; while(playersRef.current.some(p => p.name === finalName)) { finalName = `${data.name} ${count++}`; }
              const newP: Player = { id: data.playerId, name: finalName, color: data.color, x: 1200, y: 300, vx:0, vy:0, role: PlayerRole.CREWMATE, isDead: false, isBodyReported: false, isHost: false, facingRight: true, hat: data.hat, skin: data.skin, pet: data.pet };
              const updated = [...playersRef.current, newP]; updatePlayers(updated); conn.send({ type: 'JOIN_SUCCESS', room: initialRoomCode, playerId: data.playerId, isHost: false, players: updated, settings: settings }); broadcastP2P({ type: 'PLAYER_JOINED', player: newP }); break;
          case 'MOVE': const mIdx = playersRef.current.findIndex(p => p.id === data.id); if (mIdx !== -1) { playersRef.current[mIdx].x = data.x; playersRef.current[mIdx].y = data.y; playersRef.current[mIdx].facingRight = data.facingRight; } break;
          case 'ACTION': 
              if (data.action === 'KILL') { 
                  updatePlayers(playersRef.current.map(p => { if(p.id === data.targetId) return {...p, isDead: true, deathX: p.x, deathY: p.y}; if(p.id===data.killerId) return {...p, x: p.x, y: p.y}; return p; })); broadcastP2P({type: 'PLAYER_KILLED', targetId: data.targetId}); checkP2PWin(); 
              }
              else if (data.action === 'REPORT' || data.action === 'MEETING') { updatePlayers(playersRef.current.map(p => p.isDead ? { ...p, isBodyReported: true } : p)); startMeetingLocal(true); }
              else if (data.action === 'SABOTAGE') { setSabotage(data.sabotage, 30); broadcastP2P({ type: 'SABOTAGE_UPDATE', sabotage: data.sabotage, timer: 30 }); }
              else if (data.action === 'FIX_SABOTAGE') { setSabotage(SabotageType.NONE, 0); broadcastP2P({ type: 'SABOTAGE_UPDATE', sabotage: SabotageType.NONE, timer: 0 }); } break;
          case 'VOTE': setVotes(prev => { const next = { ...prev, [data.voterId]: data.targetId }; broadcastP2P({ type: 'VOTE_UPDATE', voterId: data.voterId, targetId: data.targetId }); if (Object.keys(next).length >= playersRef.current.filter(p => !p.isDead).length) setTimeout(() => endMeetingP2P(next), 500); return next; }); break;
          case 'TASK_COMPLETE': setTaskProgress(prev => Math.min(1, prev + 0.05)); broadcastP2P({ type: 'TASK_PROGRESS', progress: taskProgress + 0.05 }); break;
          case 'CHAT': if (data.message) broadcastP2P({ type: 'CHAT_MESSAGE', message: data.message }); break;
      }
  };

  const updateGameLogic = (dt: number) => {
      // 1. Cooldowns
      if (killCooldownRef.current > 0) { 
          killCooldownRef.current = Math.max(0, killCooldownRef.current - dt); 
          setKillCooldownDisplay(killCooldownRef.current);
      }
      
      // 2. Sabotage
      if (sabotageRef.current.type !== SabotageType.NONE && sabotageRef.current.timer > 0) {
          sabotageRef.current.timer = Math.max(0, sabotageRef.current.timer - dt);
          setSabotageDisplay({...sabotageRef.current});
          if (sabotageRef.current.timer <= 0 && (sabotageRef.current.type === SabotageType.REACTOR || sabotageRef.current.type === SabotageType.O2)) {
              if (gameMode === 'FREEPLAY' || (gameMode === 'P2P' && isHost)) { 
                  handleGameOver('IMPOSTOR');
              }
          }
      }

      // 3. Movement & Physics
      setPlayers(prevPlayers => {
          let nextPlayers = prevPlayers.map(p => ({...p}));
          
          const currentSpeed = PLAYER_SPEED * settingsRef.current.playerSpeed;

          if (gameMode === 'FREEPLAY') {
             // ... (Bot logic)
             nextPlayers = nextPlayers.map(p => {
                 if(p.id !== myIdRef.current && !p.isDead) {
                      let bs = botStates.current.get(p.id);
                      if (!bs) { bs = { id: p.id, state: 'IDLE', timer: Math.random() * 3 }; botStates.current.set(p.id, bs); }
                      const deadBodies = nextPlayers.filter(other => other.isDead && !other.isBodyReported && other.deathX && other.deathY);
                      for (const body of deadBodies) { if (distance(p, {x: body.deathX!, y: body.deathY!}) < INTERACT_RADIUS) { handleReport(); break; } }
                      if (bs.state === 'IDLE') { bs.timer -= dt; if (bs.timer <= 0) { bs.state = 'MOVING'; const randomTask = TASKS_TEMPLATE[Math.floor(Math.random() * TASKS_TEMPLATE.length)]; bs.targetPos = randomTask.location; } } 
                      else if (bs.state === 'MOVING' && bs.targetPos) { const d = distance(p, bs.targetPos); if (d < 10) { bs.state = 'DOING_TASK'; bs.timer = 3 + Math.random() * 5; } else { const angle = Math.atan2(bs.targetPos.y - p.y, bs.targetPos.x - p.x); p.vx = Math.cos(angle) * currentSpeed; p.vy = Math.sin(angle) * currentSpeed; const nextP = resolveCollision(p.x, p.y, p.vx, p.vy); p.x = nextP.x; p.y = nextP.y; p.facingRight = p.vx > 0; } } 
                      else if (bs.state === 'DOING_TASK') { bs.timer -= dt; if (bs.timer <= 0) { bs.state = 'IDLE'; bs.timer = Math.random() * 5; if(Math.random() < 0.5) { setTaskProgress(prev => { const next = Math.min(1, prev + 0.05); if (next >= 1) checkWinConditionLocal(); return next; }); } } }
                 }
                 return p;
             });
          }

          const meIndex = nextPlayers.findIndex(p => p.id === myIdRef.current);
          if (meIndex !== -1) {
              const me = nextPlayers[meIndex];
              
              // 4. Update Button Availability State based on new position
              // REPORT
              const deadBodies = nextPlayers.filter(p => p.isDead && !p.isBodyReported && p.deathX && p.deathY);
              const nearbyBody = deadBodies.find(b => distance(me, {x: b.deathX!, y: b.deathY!}) < INTERACT_RADIUS);
              setCanReport(!!nearbyBody && !me.isDead);

              // USE
              let canInteract = false;
              if (!me.isDead) {
                  if (sabotageRef.current.type !== SabotageType.NONE) {
                      const loc = SABOTAGE_LOCATIONS[sabotageRef.current.type];
                      if (distance(me, loc) < INTERACT_RADIUS) canInteract = true;
                  }
                  if (distance(me, EMERGENCY_BUTTON) < INTERACT_RADIUS) canInteract = true;
                  if (me.role === PlayerRole.IMPOSTOR) {
                      const nearbyVent = VENTS.find(v => distance(me, v) < INTERACT_RADIUS);
                      if (nearbyVent) canInteract = true;
                  } else {
                      const nearbyTask = tasksRef.current.find(t => !t.completed && distance(me, t.location) < INTERACT_RADIUS);
                      if (nearbyTask) canInteract = true;
                  }
              }
              setCanUse(canInteract);

              // KILL
              let canK = false;
              if (me.role === PlayerRole.IMPOSTOR && !me.isDead) {
                  const target = getClosestPlayer(me, nextPlayers, KILL_RADIUS);
                  setNearbyTarget(target); 
                  if (target && killCooldownRef.current <= 0) canK = true;
              }
              setCanKill(canK);

              // 5. Apply Movement
              if (!me.isDead || me.isDead) { 
                  let dx = 0; let dy = 0;
                  if (keys.current['KeyW'] || keys.current['ArrowUp']) dy -= currentSpeed;
                  if (keys.current['KeyS'] || keys.current['ArrowDown']) dy += currentSpeed;
                  if (keys.current['KeyA'] || keys.current['ArrowLeft']) dx -= currentSpeed;
                  if (keys.current['KeyD'] || keys.current['ArrowRight']) dx += currentSpeed;
                  if (touchJoystick.current.active) {
                      const jx = touchJoystick.current.current.x - touchJoystick.current.origin.x;
                      const jy = touchJoystick.current.current.y - touchJoystick.current.origin.y;
                      if (Math.sqrt(jx*jx + jy*jy) > 5) { const angle = Math.atan2(jy, jx); dx = Math.cos(angle) * currentSpeed; dy = Math.sin(angle) * currentSpeed; }
                  }
                  const nextPos = resolveCollision(me.x, me.y, dx, dy, me.isDead);
                  me.x = nextPos.x; me.y = nextPos.y;
                  if (dx !== 0) me.facingRight = dx > 0;
                  
                  // Key Handling - "The Magic"
                  // 'U' for Use/Vent
                  if (keys.current['KeyU'] && !prevKeyURef.current) {
                      handleUse();
                  }
                  prevKeyURef.current = !!keys.current['KeyU'];

                  // 'R' for Report
                  if (keys.current['KeyR'] && !prevKeyRRef.current) {
                      handleReport();
                  }
                  prevKeyRRef.current = !!keys.current['KeyR'];

                  // 'K' for Kill
                  if (keys.current['KeyK'] && !prevKeyKRef.current) {
                      handleKill();
                  }
                  prevKeyKRef.current = !!keys.current['KeyK'];
              }
          }
          
          playersRef.current = nextPlayers;
          return nextPlayers;
      });
  };

  const handleGameOver = (winTeam: 'CREWMATE' | 'IMPOSTOR') => {
      setWinner(winTeam);
      updateGameState(GameState.ENDED);
      if (isHost) broadcastP2P({ type: 'GAME_OVER', winner: winTeam });
      const safeName = playerName.replace(/[^a-zA-Z0-9]/g, '');
      const storedId = localStorage.getItem('sb_user_id') || 'default';
      const progress: UserProgress = JSON.parse(localStorage.getItem(`sb_progress_${storedId}`) || '{}');
      let newXp = 50; let newTrophies = 5;
      if ((winTeam === 'CREWMATE' && playersRef.current.find(p=>p.id===myIdRef.current)?.role === 'CREWMATE') || (winTeam === 'IMPOSTOR' && playersRef.current.find(p=>p.id===myIdRef.current)?.role === 'IMPOSTOR')) { newXp += 100; newTrophies += 10; progress.winsCrew += winTeam === 'CREWMATE' ? 1 : 0; progress.winsImp += winTeam === 'IMPOSTOR' ? 1 : 0; }
      progress.gamesPlayed += 1;
      const completedIds: string[] = [];
      progress.activeQuests = progress.activeQuests.map(q => { let add = 0; if (q.id.includes('game') || q.id.includes('play')) add = 1; if (q.id.includes('win') && newTrophies > 5) add = 1; if (q.id.includes('kill') && nearbyTarget === null) add = 0; if (add > 0) { const newCurr = Math.min(q.target, q.current + add); if (newCurr >= q.target && q.current < q.target) { newXp += q.xpReward; completedIds.push(q.description); } return { ...q, current: newCurr }; } return q; });
      progress.susPassXp += newXp; while(progress.susPassXp >= progress.susPassTier * 1000) { progress.susPassXp -= progress.susPassTier * 1000; progress.susPassTier++; }
      progress.susMeter += newTrophies;
      localStorage.setItem(`sb_progress_${storedId}`, JSON.stringify(progress));
      setXpGained(newXp); setTrophiesGained(newTrophies); setQuestsCompleted(completedIds);
  };

  const startMeetingLocal = (broadcast: boolean) => { updateGameState(GameState.MEETING); audio.playReport(); setMeetingTimer(settingsRef.current.votingTime); setVotes({}); setVoteResults(null); setChatMessages([]); setShowChat(true); setFixingSabotage(null); if (broadcast && isHost) broadcastP2P({ type: 'MEETING_STARTED', players: playersRef.current }); };
  const endMeetingP2P = (finalVotes: Record<string, string>) => { const tally: Record<string, number> = {}; Object.values(finalVotes).forEach(v => tally[v] = (tally[v] || 0) + 1); let ejectedId: string | null = null, maxVotes = -1, tie = false; Object.entries(tally).forEach(([id, count]) => { if (count > maxVotes) { maxVotes = count; ejectedId = id; tie = false; } else if (count === maxVotes) tie = true; }); if (tie) ejectedId = null; const res = { ejectedId, tally }; setVoteResults(res); broadcastP2P({ type: 'MEETING_ENDED', results: res, players: playersRef.current }); setTimeout(() => { setVoteResults(null); setPlayers(prev => { let updated = [...prev]; if (ejectedId && ejectedId !== 'SKIP') updated = updated.map(p => p.id === ejectedId ? { ...p, isDead: true, isBodyReported: true, deathX: p.x, deathY: p.y } : p); updated = updated.map(p => ({...p, x: 1200, y: 300})); updatePlayers(updated); broadcastP2P({ type: 'GAME_STATE_UPDATE', players: updated }); return updated; }); updateGameState(GameState.PLAYING); checkP2PWin(); }, 4000); };
  const checkP2PWin = () => { const crew = playersRef.current.filter(p => !p.isDead && p.role === PlayerRole.CREWMATE).length; const imp = playersRef.current.filter(p => !p.isDead && p.role === PlayerRole.IMPOSTOR).length; let w: 'CREWMATE' | 'IMPOSTOR' | null = null; if (imp >= crew) w = 'IMPOSTOR'; else if (imp === 0) w = 'CREWMATE'; if (w) { handleGameOver(w); } };
  const initializeFreeplay = () => { 
      const id = 'p_' + Math.floor(Math.random() * 10000); 
      updateMyId(id); 
      const storedId = localStorage.getItem('sb_user_id') || 'default';
      const progress: UserProgress = JSON.parse(localStorage.getItem(`sb_progress_${storedId}`) || '{}');
      const me: Player = { id, name: playerName, color: playerColor, x: 1400, y: 400, vx: 0, vy: 0, role: PlayerRole.CREWMATE, isDead: false, isBodyReported: false, isHost: true, facingRight: true, hat: progress.equippedHat, skin: progress.equippedSkin, pet: progress.equippedPet }; 
      let initialPlayers = [me]; 
      for (let i = 0; i < 14; i++) { const botId = `bot_${i}`; initialPlayers.push({ id: botId, name: `Bot ${i + 1}`, color: COLORS[(Object.values(PlayerColor).indexOf(playerColor) + i + 1) % COLORS.length] as any, x: 1400 + (Math.random() - 0.5) * 200, y: 400 + (Math.random() - 0.5) * 200, vx: 0, vy: 0, role: PlayerRole.CREWMATE, isDead: false, isBodyReported: false, isHost: false, facingRight: true, }); botStates.current.set(botId, { id: botId, state: 'IDLE', timer: 0 }); } updatePlayers(initialPlayers); updateGameState(GameState.LOBBY); setIsConnected(true); 
  };
  const copyCode = () => { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const startGame = () => { audio.playClick(); if (gameMode === 'FREEPLAY') { const newPlayers = playersRef.current.map(p => ({...p})); const myP = newPlayers.find(p => p.id === myIdRef.current); if (myP) { myP.role = initialRole || PlayerRole.CREWMATE; } let impCount = settings.impostorCount; if (myP?.role === PlayerRole.IMPOSTOR) impCount--; const bots = newPlayers.filter(p => p.id !== myIdRef.current); const shuffledBots = bots.sort(() => 0.5 - Math.random()); shuffledBots.forEach((p, i) => { p.role = i < impCount ? PlayerRole.IMPOSTOR : PlayerRole.CREWMATE; }); newPlayers.forEach(p => { p.x = 1200 + (Math.random() - 0.5) * 100; p.y = 300 + (Math.random() - 0.5) * 100; p.isDead = false; p.isBodyReported = false; p.deathX = undefined; p.deathY = undefined; }); updatePlayers(newPlayers); if (myP?.role === PlayerRole.CREWMATE) { const myTasks = [...TASKS_TEMPLATE].sort(() => 0.5 - Math.random()).slice(0, settings.taskCount).map(t => ({ ...t, completed: false })); updateTasks(myTasks); } else { updateTasks([]); } setKillCooldown(settings.killCooldown); setShowRoleReveal(true); updateGameState(GameState.REVEAL); setTimeout(() => { setShowRoleReveal(false); updateGameState(GameState.PLAYING); }, 3000); } else if (gameMode === 'P2P' && isHost) { const newPlayers = playersRef.current.map(p => ({...p})); for (let i = newPlayers.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [newPlayers[i], newPlayers[j]] = [newPlayers[j], newPlayers[i]]; } newPlayers.forEach((p, idx) => { if (idx < settings.impostorCount) { p.role = PlayerRole.IMPOSTOR; } else { p.role = PlayerRole.CREWMATE; } p.x = 1200 + (Math.random() - 0.5) * 50; p.y = 300 + (Math.random() - 0.5) * 50; p.isDead = false; p.isBodyReported = false; }); updatePlayers(newPlayers); broadcastP2P({ type: 'GAME_STARTED', players: newPlayers, settings }); const me = newPlayers.find(p => p.id === myIdRef.current); if (me?.role === PlayerRole.CREWMATE) { const myTasks = [...TASKS_TEMPLATE].sort(() => 0.5 - Math.random()).slice(0, settings.taskCount).map(t => ({ ...t, completed: false })); updateTasks(myTasks); } else { updateTasks([]); } setKillCooldown(settings.killCooldown); setShowRoleReveal(true); updateGameState(GameState.REVEAL); setTimeout(() => { setShowRoleReveal(false); updateGameState(GameState.PLAYING); }, 3000); } };

  const addToFriends = (friendName: string) => { alert("Send a friend request from the Main Menu!"); };
  const inviteFriend = (friendName: string) => { if (lobbyWs.current?.readyState === WebSocket.OPEN) { lobbyWs.current.send(JSON.stringify({ type: 'SEND_INVITE', targetName: friendName, hostName: playerName, roomCode: roomCode })); alert(`Invite sent to ${friendName}`); } else { alert("Not connected to discovery server."); } };
  const setSabotage = (type: SabotageType, timer: number) => { sabotageRef.current = { type, timer }; setSabotageDisplay({ type, timer }); }
  const setKillCooldown = (val: number) => { killCooldownRef.current = val; setKillCooldownDisplay(val); }
  const scrollToBottom = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  const toggleMap = () => { setShowMap(prev => { const n = !prev; showMapRef.current = n; return n; }); };

  const handleKill = () => { 
      // IMMEDIATE MODE LOGIC using refs to ensure responsiveness
      const me = playersRef.current.find(p => p.id === myIdRef.current);
      if (!me || me.isDead || me.role !== PlayerRole.IMPOSTOR || gameStateRef.current !== GameState.PLAYING || killCooldownRef.current > 0) return;
      
      const target = getClosestPlayer(me, playersRef.current, KILL_RADIUS);
      if (!target) return;

      const targetId = target.id; 
      updatePlayers(playersRef.current.map(p => { 
          if (p.id === targetId) return { ...p, isDead: true, deathX: p.x, deathY: p.y }; 
          if (p.id === myIdRef.current) return { ...p, x: target.x, y: target.y }; 
          return p; 
      })); 
      setKillCooldown(settingsRef.current.killCooldown); 
      setNearbyTarget(null); 
      audio.playKill(); 
      if (gameMode === 'P2P') { 
          if (isHost) { 
              broadcastP2P({ type: 'PLAYER_KILLED', targetId }); 
              checkP2PWin(); 
          } else { 
              sendP2P({ type: 'ACTION', action: 'KILL', targetId: targetId, killerId: myIdRef.current }); 
          } 
      } else { 
          setTimeout(checkWinConditionLocal, 10); 
      } 
  };

  const checkWinConditionLocal = () => { const currentPlayers = playersRef.current; const activeCrew = currentPlayers.filter(p => !p.isDead && p.role === PlayerRole.CREWMATE); const activeImp = currentPlayers.filter(p => !p.isDead && p.role === PlayerRole.IMPOSTOR); let w: 'CREWMATE' | 'IMPOSTOR' | null = null; if (activeImp.length >= activeCrew.length) w = 'IMPOSTOR'; else if (activeImp.length === 0) w = 'CREWMATE'; else if (taskProgress >= 1) w = 'CREWMATE'; if (w) { handleGameOver(w); } };
  
  const handleReport = () => { 
      const me = playersRef.current.find(p => p.id === myIdRef.current);
      if (!me || me.isDead) return;
      
      const deadBodies = playersRef.current.filter(p => p.isDead && !p.isBodyReported && p.deathX !== undefined && p.deathY !== undefined);
      const nearbyBody = deadBodies.find(b => distance(me, {x: b.deathX!, y: b.deathY!}) < INTERACT_RADIUS);
      
      // Strict distance check for 'R' key, but allow loose check for UI feedback
      if (!nearbyBody) return;

      audio.playReport(); 
      if (gameMode === 'P2P') { 
          if (isHost) startMeetingLocal(true); 
          else sendP2P({ type: 'ACTION', action: 'REPORT' }); 
      } else { 
          updatePlayers(playersRef.current.map(p => p.isDead ? { ...p, isBodyReported: true } : p)); 
          startMeetingLocal(false); 
      } 
  };

  const handleVote = (targetId: string) => { if(votes[myIdRef.current] || voteResults) return; if (gameMode === 'P2P') { setVotes(prev => ({ ...prev, [myIdRef.current]: targetId })); if (isHost) { broadcastP2P({ type: 'VOTE_UPDATE', voterId: myIdRef.current, targetId }); if (Object.keys(votes).length + 1 >= playersRef.current.filter(p => !p.isDead).length) setTimeout(() => endMeetingP2P({...votes, [myIdRef.current]: targetId}), 500); } else { sendP2P({ type: 'VOTE', voterId: myIdRef.current, targetId }); } } else { setVotes(prev => ({ ...prev, [myIdRef.current]: targetId })); } };
  const handleSabotage = (type: SabotageType) => { if (gameStateRef.current !== GameState.PLAYING || sabotageRef.current.type !== SabotageType.NONE) return; if (gameMode === 'P2P') { if (isHost) { setSabotage(type, 30); broadcastP2P({ type: 'SABOTAGE_UPDATE', sabotage: type, timer: 30 }); } else { sendP2P({ type: 'ACTION', action: 'SABOTAGE', sabotage: type }); } } else { setSabotage(type, 30); } };
  const handleFixSabotage = () => { const me = playersRef.current.find(p => p.id === myIdRef.current); if (!me || sabotageRef.current.type === SabotageType.NONE) return; const loc = SABOTAGE_LOCATIONS[sabotageRef.current.type]; if (distance(me, loc) < INTERACT_RADIUS) { if (sabotageRef.current.type === SabotageType.LIGHTS) setLightsSwitches([false, false, false, false, false].map(() => Math.random() > 0.5)); setSabotageFixProgress(0); setFixingSabotage(sabotageRef.current.type); } };
  const handleFixed = () => { setFixingSabotage(null); if (gameMode === 'P2P') { if (isHost) { setSabotage(SabotageType.NONE, 0); broadcastP2P({ type: 'SABOTAGE_UPDATE', sabotage: SabotageType.NONE, timer: 0 }); } else { sendP2P({ type: 'ACTION', action: 'FIX_SABOTAGE' }); } } else { setSabotage(SabotageType.NONE, 0); } };
  const handleVent = () => { if (gameStateRef.current !== GameState.PLAYING) return; const me = playersRef.current.find(p => p.id === myIdRef.current); if (!me) return; const nearbyVent = VENTS.find(v => distance(me, v) < INTERACT_RADIUS); if (nearbyVent) { const nextVent = VENTS.find(v => v.id === nearbyVent.link); if (nextVent) { audio.playVent(); const newPlayers = playersRef.current.map(p => p.id === myIdRef.current ? { ...p, x: nextVent.x, y: nextVent.y } : p); updatePlayers(newPlayers); if (gameMode === 'P2P' && !isHost) sendP2P({ type: 'MOVE', id: myIdRef.current, x: nextVent.x, y: nextVent.y, facingRight: me.facingRight }); } } };
  
  // Ref-based handleUse to ensure immediate action regardless of render state lag
  const handleUse = () => {
      const me = playersRef.current.find(p => p.id === myIdRef.current);
      if (!me || me.isDead) return;

      // 1. Report
      const deadBodies = playersRef.current.filter(p => p.isDead && !p.isBodyReported && p.deathX !== undefined && p.deathY !== undefined);
      const nearbyBody = deadBodies.find(b => distance(me, {x: b.deathX!, y: b.deathY!}) < INTERACT_RADIUS);
      if (nearbyBody) { handleReport(); return; }

      // 2. Fix
      if (sabotageRef.current.type !== SabotageType.NONE) {
          const loc = SABOTAGE_LOCATIONS[sabotageRef.current.type];
          if (distance(me, loc) < INTERACT_RADIUS) { handleFixSabotage(); return; }
      }

      // 3. Button
      if (distance(me, EMERGENCY_BUTTON) < INTERACT_RADIUS) {
          if (gameMode === 'P2P') { if(isHost) startMeetingLocal(true); else sendP2P({ type: 'ACTION', action: 'MEETING' }); } 
          else startMeetingLocal(false);
          return;
      }

      // 4. Vent
      if (me.role === PlayerRole.IMPOSTOR) {
          const nearbyVent = VENTS.find(v => distance(me, v) < INTERACT_RADIUS);
          if (nearbyVent) { handleVent(); return; }
      } else {
      // 5. Task
          const nearbyTask = tasksRef.current.find(t => !t.completed && distance(me, t.location) < INTERACT_RADIUS);
          if (nearbyTask) { setActiveTask(nearbyTask); return; }
      }
  };

  const completeTask = (taskId: string) => { audio.playTaskComplete(); updateTasks(tasksRef.current.map(t => t.id === taskId ? { ...t, completed: true } : t)); setActiveTask(null); if (gameMode === 'P2P' && !isHost) sendP2P({ type: 'TASK_COMPLETE' }); else if (gameMode === 'FREEPLAY' || (gameMode === 'P2P' && isHost)) { setTaskProgress(prev => prev + 0.05); if (isHost) broadcastP2P({ type: 'TASK_PROGRESS', progress: taskProgress + 0.05 }); checkWinConditionLocal(); } };
  const handleChatSend = () => { if (!chatInput.trim()) return; const msg: ChatMessage = { id: Math.random().toString(36), playerId: myIdRef.current, playerName: playerName, playerColor: playerColor, text: chatInput.trim(), isDead: me?.isDead || false, timestamp: Date.now() }; setChatMessages(prev => [...prev, msg]); scrollToBottom(); setChatInput(''); if (gameMode === 'P2P') { if (isHost) { broadcastP2P({ type: 'CHAT_MESSAGE', message: msg }); } else { sendP2P({ type: 'CHAT', message: msg }); } } };

  const renderInteractiveTask = () => { if (!activeTask) return null; return <button onClick={() => completeTask(activeTask.id)} className="bg-blue-500 px-6 py-3 rounded font-bold animate-pulse">COMPLETE</button>; };
  const renderSabotageFix = () => { if (!fixingSabotage) return null; if (fixingSabotage === SabotageType.LIGHTS) { const allOn = lightsSwitches.every(s => s); if (allOn) setTimeout(handleFixed, 500); return (<div className="flex gap-4 items-center justify-center p-4 bg-gray-800 rounded"> {lightsSwitches.map((isOn, idx) => (<div key={idx} onClick={() => { const newSwitches = [...lightsSwitches]; newSwitches[idx] = !newSwitches[idx]; setLightsSwitches(newSwitches); }} className={`w-8 h-12 rounded cursor-pointer border-2 ${isOn ? 'bg-green-500 border-green-300' : 'bg-red-900 border-red-700'}`}> <div className={`w-full h-1/2 bg-white/20 ${isOn ? 'mt-0' : 'mt-6'}`}></div> </div>))} </div>); } return (<div className="flex flex-col items-center gap-4"> <div className="text-white mb-2">Hold to Fix</div> <button onClick={() => { setSabotageFixProgress(prev => { const next = prev + 0.2; if (next >= 1) { handleFixed(); return 1; } return next; }) }} className="w-24 h-24 rounded-full bg-blue-600 active:bg-blue-500 flex items-center justify-center border-4 border-white text-white font-bold" > {(sabotageFixProgress * 100).toFixed(0)}% </button> </div>); };

  // Loop & Draw (same as before)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    const handleTouchStart = (e: TouchEvent) => { if (gameStateRef.current !== GameState.PLAYING) return; const touch = e.touches[0]; if (touch.clientX < window.innerWidth / 2) touchJoystick.current = { active: true, origin: {x: touch.clientX, y: touch.clientY}, current: {x: touch.clientX, y: touch.clientY} }; };
    const handleTouchMove = (e: TouchEvent) => { if (touchJoystick.current.active) touchJoystick.current.current = {x: e.touches[0].clientX, y: e.touches[0].clientY}; };
    const handleTouchEnd = () => { touchJoystick.current.active = false; };
    window.addEventListener('touchstart', handleTouchStart); window.addEventListener('touchmove', handleTouchMove); window.addEventListener('touchend', handleTouchEnd);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); window.removeEventListener('touchstart', handleTouchStart); window.removeEventListener('touchmove', handleTouchMove); window.removeEventListener('touchend', handleTouchEnd); };
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let tick = 0;
    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      tick++;
      if (gameStateRef.current === GameState.PLAYING) {
        updateGameLogic(dt);
        if (gameMode === 'P2P') {
            const me = playersRef.current.find(p => p.id === myIdRef.current);
            if (me && !isHost && tick % 3 === 0) sendP2P({ type: 'MOVE', id: myIdRef.current, x: me.x, y: me.y, facingRight: me.facingRight });
            if (isHost && tick % 6 === 0) broadcastP2P({ type: 'GAME_STATE_UPDATE', players: playersRef.current });
        }
      }
      drawGame(dt);
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameMode]); 

  const drawGame = (dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Smooth Interpolation
    const renderPlayers = playersRef.current.map(p => {
        if (p.id === myIdRef.current) return p; 
        const target = playerTargetsRef.current.get(p.id);
        if (target) return { ...p, x: p.x + (target.x - p.x) * 0.2, y: p.y + (target.y - p.y) * 0.2, facingRight: target.facingRight };
        return p;
    });
    
    // Sync ref
    playersRef.current.forEach((p, i) => { if (p.id !== myIdRef.current && playerTargetsRef.current.has(p.id)) { const rp = renderPlayers[i]; p.x = rp.x; p.y = rp.y; p.facingRight = rp.facingRight; } });
    
    const me = renderPlayers.find(p => p.id === myIdRef.current);
    const camX = me ? -me.x + canvas.width / 2 : 0;
    const camY = me ? -me.y + canvas.height / 2 : 0;

    ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(camX, camY);
    ctx.fillStyle = '#1e1e24'; ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    for (const w of WALLS) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
    ctx.fillStyle = '#475569'; ctx.strokeStyle = '#94a3b8';
    VENTS.forEach(v => { ctx.beginPath(); ctx.rect(v.x - 15, v.y - 10, 30, 20); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(v.x - 15, v.y); ctx.lineTo(v.x + 15, v.y); ctx.stroke(); });
    ctx.font = 'bold 24px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center';
    ctx.fillText("CAFETERIA", 1400, 250); ctx.fillText("ADMIN", 1650, 700); ctx.fillText("REACTOR", 200, 600);
    if (me?.role === PlayerRole.CREWMATE && !me.isDead) { for(const t of tasksRef.current) { if (t.completed) continue; ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.arc(t.location.x, t.location.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); } }
    ctx.fillStyle = '#EF4444'; ctx.fillRect(EMERGENCY_BUTTON.x - 20, EMERGENCY_BUTTON.y - 20, 40, 40);
    
    [...renderPlayers].sort((a, b) => a.y - b.y).forEach(p => { 
        if (p.isDead && !p.isBodyReported && p.deathX !== undefined && p.deathY !== undefined) { 
            ctx.fillStyle = p.color === PlayerColor.RAINBOW ? 'purple' : p.color; 
            ctx.beginPath(); ctx.arc(p.deathX, p.deathY + 10, 14, Math.PI, 0); ctx.fill(); ctx.stroke(); 
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p.deathX - 3, p.deathY - 5, 6, 12); 
            ctx.beginPath(); ctx.arc(p.deathX - 4, p.deathY - 6, 4, 0, Math.PI * 2); ctx.arc(p.deathX + 4, p.deathY - 6, 4, 0, Math.PI * 2); ctx.fill(); 
        }
        if (!p.isDead || (me?.isDead && p.isDead)) { 
            if (p.isDead) ctx.globalAlpha = 0.5; 
            drawCrewmate(ctx, p); 
            ctx.globalAlpha = 1.0; 
        }
    });
    ctx.restore();
    if (sabotageRef.current.type === SabotageType.LIGHTS && me?.role === PlayerRole.CREWMATE && !me.isDead) { ctx.fillStyle = 'black'; ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.arc(canvas.width/2, canvas.height/2, 100, 0, Math.PI*2, true); ctx.fill(); }
    if (touchJoystick.current.active) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(touchJoystick.current.origin.x, touchJoystick.current.origin.y, 40, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(touchJoystick.current.current.x, touchJoystick.current.current.y, 20, 0, Math.PI*2); ctx.fill(); }
    
    if (showMapRef.current && me) {
        ctx.save();
        ctx.resetTransform();
        const mapW = 500; const mapH = 300; const mapX = (canvas.width - mapW) / 2; const mapY = (canvas.height - mapH) / 2;
        ctx.translate(mapX, mapY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; ctx.fillRect(0, 0, mapW, mapH); ctx.lineWidth = 2; ctx.strokeStyle = '#475569'; ctx.strokeRect(0, 0, mapW, mapH);
        const sX = mapW / MAP_WIDTH; const sY = mapH / MAP_HEIGHT;
        ctx.fillStyle = '#64748b'; WALLS.forEach(w => ctx.fillRect(w.x * sX, w.y * sY, w.w * sX, w.h * sY));
        if (me.role === PlayerRole.CREWMATE) { ctx.fillStyle = '#FACC15'; tasksRef.current.forEach(t => { if (!t.completed) { ctx.beginPath(); ctx.arc(t.location.x * sX, t.location.y * sY, 3, 0, Math.PI * 2); ctx.fill(); } }); }
        ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(me.x * sX, me.y * sY, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }
  };

  const drawCrewmate = (ctx: CanvasRenderingContext2D, p: Player) => {
    let fill = p.color === PlayerColor.RAINBOW ? `hsl(${Date.now() / 10 % 360}, 100%, 50%)` : p.color;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'black'; ctx.stroke();
    ctx.beginPath(); const backpackX = p.facingRight ? p.x - 14 : p.x + 14; 
    ctx.roundRect(backpackX - 4, p.y - 10, 8, 20, 3); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();

    if (p.skin) {
        if (p.skin === 'skin_suit') { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 20, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(p.x, p.y-5); ctx.lineTo(p.x-5, p.y+10); ctx.lineTo(p.x+5, p.y+10); ctx.fill(); ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(p.x, p.y+12, 2, 0, Math.PI*2); ctx.fill(); }
        else if (p.skin === 'skin_steam_armor') { ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 17, 21, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#CD853F'; ctx.fillRect(p.x-10, p.y, 20, 5); ctx.strokeStyle = '#DAA520'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.stroke(); }
        else if (p.skin === 'skin_lab') { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 17, 21, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d1d5db'; ctx.fillRect(p.x-2, p.y-10, 4, 30); }
        else if (p.skin === 'skin_cop') { ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 20, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x-5, p.y-5, 2, 0, Math.PI*2); ctx.fill(); }
        else if (p.skin === 'skin_mech') { ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.rect(p.x-16, p.y-20, 32, 40); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.fillRect(p.x-5, p.y-5, 10, 5); }
    }
    
    ctx.fillStyle = '#7DD3FC'; const visorX = p.facingRight ? p.x + 4 : p.x - 4; ctx.beginPath(); ctx.ellipse(visorX, p.y - 4, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    
    if (p.hat) {
        ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
        if (p.hat === 'hat_tophat') { ctx.fillStyle = '#111'; ctx.fillRect(p.x-15, p.y-35, 30, 20); ctx.fillRect(p.x-20, p.y-15, 40, 5); ctx.strokeRect(p.x-15, p.y-35, 30, 20); ctx.strokeRect(p.x-20, p.y-15, 40, 5); }
        else if (p.hat === 'hat_goggles') { ctx.fillStyle = '#DAA520'; ctx.beginPath(); ctx.arc(p.x-8, p.y-20, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x+8, p.y-20, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#87CEEB'; ctx.beginPath(); ctx.arc(p.x-8, p.y-20, 3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(p.x+8, p.y-20, 3, 0, Math.PI*2); ctx.fill(); }
        else if (p.hat === 'hat_crown') { ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.moveTo(p.x-12, p.y-18); ctx.lineTo(p.x-12, p.y-35); ctx.lineTo(p.x-6, p.y-25); ctx.lineTo(p.x, p.y-35); ctx.lineTo(p.x+6, p.y-25); ctx.lineTo(p.x+12, p.y-35); ctx.lineTo(p.x+12, p.y-18); ctx.fill(); ctx.stroke(); }
        else if (p.hat === 'hat_gear') { ctx.fillStyle = '#cd7f32'; ctx.beginPath(); for(let i=0;i<8;i++) { const a=i*Math.PI/4; ctx.lineTo(p.x+Math.cos(a)*15, p.y-25+Math.sin(a)*15); ctx.lineTo(p.x+Math.cos(a+0.2)*12, p.y-25+Math.sin(a+0.2)*12); } ctx.fill(); ctx.stroke(); ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(p.x, p.y-25, 5, 0, Math.PI*2); ctx.fill(); }
        else if (p.hat === 'hat_ushanka') { ctx.fillStyle = '#8B4513'; ctx.fillRect(p.x-15, p.y-28, 30, 15); ctx.fillRect(p.x-15, p.y-20, 8, 15); ctx.fillRect(p.x+7, p.y-20, 8, 15); ctx.strokeRect(p.x-15, p.y-28, 30, 15); }
        else if (p.hat === 'hat_fez') { ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.moveTo(p.x-10, p.y-15); ctx.lineTo(p.x-8, p.y-30); ctx.lineTo(p.x+8, p.y-30); ctx.lineTo(p.x+10, p.y-15); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(p.x, p.y-30); ctx.lineTo(p.x+5, p.y-25); ctx.stroke(); }
        else if (p.hat === 'hat_halo') { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(p.x, p.y-35, 12, 4, 0, 0, Math.PI*2); ctx.stroke(); }
        else if (p.hat === 'hat_horns') { ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.moveTo(p.x-8, p.y-15); ctx.quadraticCurveTo(p.x-15, p.y-30, p.x-5, p.y-25); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x+8, p.y-15); ctx.quadraticCurveTo(p.x+15, p.y-30, p.x+5, p.y-25); ctx.fill(); }
        else if (p.hat === 'hat_chef') { ctx.fillStyle = 'white'; ctx.beginPath(); ctx.rect(p.x-12, p.y-20, 24, 5); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y-25, 12, Math.PI, 0); ctx.fill(); ctx.stroke(); }
        else if (p.hat === 'hat_flower') { ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.arc(p.x-8, p.y-15, 5, 0, Math.PI*2); ctx.arc(p.x+8, p.y-15, 5, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x, p.y-15, 4, 0, Math.PI*2); ctx.fill(); }
    }

    if (p.pet) {
        const petX = p.facingRight ? p.x - 30 : p.x + 30;
        const petY = p.y + 10;
        if (p.pet === 'pet_steam_bot') { ctx.fillStyle = '#cd7f32'; ctx.fillRect(petX-5, petY-8, 10, 10); ctx.fillStyle = '#00ff00'; ctx.fillRect(petX-3, petY-6, 3, 3); }
        else if (p.pet === 'pet_dog') { ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(petX, petY, 8, 5, 0, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(petX, petY-5, 5, 0, Math.PI*2); ctx.fill(); }
        else if (p.pet === 'pet_blob') { ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(petX, petY, 6, Math.PI, 0); ctx.lineTo(petX+6, petY+3); ctx.lineTo(petX-6, petY+3); ctx.fill(); }
        else if (p.pet === 'pet_ufo') { ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.ellipse(petX, petY-10, 10, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(petX, petY-12, 4, Math.PI, 0); ctx.fill(); }
        else if (p.pet === 'pet_rock') { ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.arc(petX, petY, 6, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'white'; ctx.fillRect(petX-3, petY-2, 2, 2); ctx.fillRect(petX+1, petY-2, 2, 2); }
    }

    ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y - 42);
    const localMe = playersRef.current.find(x => x.id === myIdRef.current);
    if (gameStateRef.current === GameState.PLAYING && (p.id === myIdRef.current || (p.role === PlayerRole.IMPOSTOR && localMe?.role === PlayerRole.IMPOSTOR))) { 
        ctx.fillStyle = p.role === PlayerRole.IMPOSTOR ? '#ef4444' : '#86efac'; 
        ctx.font = '10px Arial'; 
        ctx.fillText(p.role === PlayerRole.IMPOSTOR ? 'Impostor' : 'Crew', p.x, p.y - 54); 
    }
  };

  const ActionButton = ({ onClick, label, active, color, icon }: any) => (
      <button 
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); audio.playClick(); onClick(); }}
        className={`
            w-24 h-24 sm:w-28 sm:h-28 
            rounded-xl 
            border-4 border-b-8 border-r-8 
            font-black text-xl 
            shadow-xl transition-all 
            flex flex-col items-center justify-center 
            pointer-events-auto select-none 
            skew-x-[-6deg] transform
            active:translate-y-2 active:translate-x-2 active:border-b-4 active:border-r-4
            ${!active ? 'opacity-50 grayscale border-slate-600 bg-slate-800 text-gray-500' : `${color} text-white border-black/30 hover:scale-105 hover:brightness-110`}
        `}
      >
          <div className="skew-x-[6deg] flex flex-col items-center">
            {icon && <div className="mb-1">{icon}</div>}
            <span className="uppercase text-sm sm:text-base">{label}</span>
          </div>
      </button>
  );

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center font-sans touch-none select-none">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block absolute inset-0 z-0" />
      
      {!isConnected && ( <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 z-50 animate-pulse border-b-4 border-r-4 border-red-900 skew-x-[-10deg]"> <div className="skew-x-[10deg] flex items-center gap-2"><Loader2 className="animate-spin"/> CONNECTING...</div> </div> )}
      {showRoleReveal && me && ( 
          <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center animate-pulse"> 
              <h1 className={`text-8xl font-black skew-x-[-10deg] ${me.role === PlayerRole.IMPOSTOR ? 'text-red-600 drop-shadow-[5px_5px_0_rgba(100,0,0,1)]' : 'text-blue-500 drop-shadow-[5px_5px_0_rgba(0,0,100,1)]'}`}>{me.role}</h1> 
              <p className="text-white text-2xl mt-4 font-mono">{me.role === PlayerRole.IMPOSTOR ? 'Kill the crewmates.' : 'Complete tasks to win.'}</p> 
          </div> 
      )}
      
      {/* Lobby */}
      {gameState === GameState.LOBBY && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white p-4 z-40">
              <div className="flex justify-between w-full max-w-4xl mb-4 items-center bg-slate-800 p-4 rounded-xl border-4 border-slate-600 skew-x-[-2deg]">
                   <div className="flex items-center gap-3 skew-x-[2deg]">
                       <h1 className="text-4xl font-bold font-mono text-cyan-400">CODE: {roomCode}</h1>
                       <button onClick={copyCode} className={`p-2 rounded transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}> {copied ? <Check size={24} /> : <Copy size={24} />} </button>
                   </div>
                   <button onClick={() => setShowLeaveMenu(true)} className="bg-red-600 p-2 rounded hover:bg-red-500 skew-x-[2deg]"><LogOut/></button>
              </div>
              
              <div className="flex gap-4 mb-8 flex-wrap justify-center max-w-4xl bg-slate-900/50 p-8 rounded-xl border-2 border-slate-700"> 
                  {players.map(p => (
                      <div key={p.id} onClick={() => addToFriends(p.name)} className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform group">
                          <div className="w-12 h-16 rounded-full mb-2 border-2 border-black relative group-hover:border-white" style={{ backgroundColor: p.color === PlayerColor.RAINBOW ? 'purple' : p.color }}>
                              {p.hat && <div className="absolute -top-3 left-0 w-full text-center text-xs">🎩</div>}
                          </div>
                          <span className="text-xs flex items-center gap-1 font-bold group-hover:text-yellow-400">{p.name}</span>
                      </div>
                  ))} 
              </div>
              
              {isHost ? ( 
                  <div className="flex gap-4 items-center"> 
                      <button onClick={() => setShowSettings(!showSettings)} className="bg-gray-700 hover:bg-gray-600 p-4 rounded-xl border-b-4 border-gray-900 active:translate-y-1 active:border-b-0"><Settings /></button> 
                      <button onClick={startGame} className="bg-green-600 hover:bg-green-500 text-white px-12 py-6 rounded-xl font-bold text-2xl flex items-center gap-2 transition-transform active:scale-95 border-b-8 border-green-800 active:border-b-0 skew-x-[-10deg]">
                          <div className="skew-x-[10deg] flex items-center gap-2"><Play /> START GAME</div>
                      </button> 
                  </div> 
              ) : <p className="text-2xl animate-pulse font-mono text-yellow-400">WAITING FOR HOST...</p>}
              
              {showSettings && ( 
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"> 
                      <div className="bg-slate-800 p-8 rounded-xl border-4 border-slate-600 w-96 shadow-2xl skew-x-[-2deg]"> 
                          <div className="skew-x-[2deg]">
                              <h3 className="font-black text-2xl mb-6 text-white uppercase border-b-2 border-slate-600 pb-2">Lobby Settings</h3> 
                              <div className="space-y-4"> 
                                  <label className="block text-sm text-gray-300 font-bold">Impostors (1-3): <input type="number" min="1" max="3" value={settings.impostorCount} onChange={e=>updateSettings({...settings, impostorCount: +e.target.value})} className="bg-black text-white p-2 w-full rounded border border-slate-600"/></label> 
                                  <label className="block text-sm text-gray-300 font-bold">Kill Cooldown (10-60s): <input type="number" min="10" max="60" value={settings.killCooldown} onChange={e=>updateSettings({...settings, killCooldown: +e.target.value})} className="bg-black text-white p-2 w-full rounded border border-slate-600"/></label>
                                  <label className="block text-sm text-gray-300 font-bold">Player Speed (0.5x - 3x): <div className="flex items-center gap-2"><input type="range" min="0.5" max="3" step="0.25" value={settings.playerSpeed} onChange={e=>updateSettings({...settings, playerSpeed: parseFloat(e.target.value)})} className="w-full accent-cyan-500"/> <span className="font-mono text-cyan-400 w-12">{settings.playerSpeed}x</span></div></label>
                                  <label className="block text-sm text-gray-300 font-bold">Total Tasks (1-10): <input type="number" min="1" max="10" value={settings.taskCount} onChange={e=>updateSettings({...settings, taskCount: +e.target.value})} className="bg-black text-white p-2 w-full rounded border border-slate-600"/></label>
                                  <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 text-white py-3 rounded font-bold mt-4 hover:bg-blue-500 border-b-4 border-blue-800 active:border-0 active:translate-y-1">SAVE & CLOSE</button> 
                              </div> 
                          </div>
                      </div> 
                  </div> 
              )}
          </div>
      )}

      {/* HUD - NEW STYLIZED LAYOUT */}
      {gameState === GameState.PLAYING && me && ( 
        <div className="absolute inset-0 pointer-events-none z-10">
            {/* Task Bar */}
            <div className="absolute top-2 left-2 right-2 h-8 bg-gray-800 border-4 border-gray-600 rounded-none -skew-x-12 overflow-hidden pointer-events-auto"> 
                <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${taskProgress * 100}%` }}></div> 
            </div> 
            
            {/* Task List */}
            {tasks.length > 0 && ( 
                <div className="absolute top-14 left-4 bg-slate-900/90 p-4 rounded-xl border-l-4 border-slate-500 text-white font-mono pointer-events-auto select-none text-sm max-w-[280px] shadow-lg transform skew-x-[-2deg]"> 
                    <div className="transform skew-x-[2deg]">
                        {tasks.map(t => <div key={t.id} className={`mb-1 flex items-center gap-2 ${t.completed ? 'text-green-400 line-through opacity-50' : 'text-white'}`}>{t.completed && <Check size={12}/>} {t.title}</div>)} 
                    </div>
                </div> 
            )} 
            
            {/* Sabotage Alert */}
            {sabotageDisplay.type !== SabotageType.NONE && ( 
                <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-6 py-3 rounded-none skew-x-[-12deg] border-4 border-red-900 animate-pulse font-black flex items-center gap-4 shadow-xl">
                    <div className="skew-x-[12deg] flex items-center gap-2 text-xl">
                        <AlertTriangle size={28} /> 
                        {sabotageDisplay.type} FAILURE IN: {Math.ceil(sabotageDisplay.timer)}s
                    </div>
                </div> 
            )} 
            
            <div className="absolute bottom-8 right-8 flex gap-4 items-end pointer-events-auto z-50"> 
                {/* USE/VENT BUTTON */}
                <ActionButton 
                    active={canUse} 
                    onClick={handleUse} 
                    label={me.role === PlayerRole.IMPOSTOR && distance(me, VENTS.find(v=>distance(me,v)<INTERACT_RADIUS) || {x:-999,y:-999}) < INTERACT_RADIUS ? "VENT" : "USE"} 
                    color="bg-slate-600 border-slate-800"
                    icon={<Hand size={32}/>}
                />
                
                {/* REPORT BUTTON */}
                <ActionButton 
                    active={canReport} 
                    onClick={handleReport} 
                    label="REPORT" 
                    color="bg-purple-600 border-purple-800" 
                    icon={<AlertTriangle size={32}/>}
                />
                
                {/* KILL BUTTON */}
                {me.role === PlayerRole.IMPOSTOR && (
                    <ActionButton 
                        active={canKill} 
                        onClick={handleKill} 
                        label={killCooldownDisplay > 0 ? Math.ceil(killCooldownDisplay).toString() : "KILL"} 
                        color="bg-red-600 border-red-800" 
                        icon={<Skull size={32}/>}
                    />
                )}
            </div>
            
            {/* Impostor Sabotage Menu (Small) */}
            {me.role === PlayerRole.IMPOSTOR && (
                <div className="absolute bottom-8 left-8 flex flex-col gap-2 pointer-events-auto z-50">
                    <button onClick={() => handleSabotage(SabotageType.LIGHTS)} className="bg-slate-800 text-white p-3 rounded-r-xl border-l-4 border-yellow-500 active:scale-95 flex items-center gap-2 hover:bg-slate-700 shadow-lg font-bold text-sm"><Zap size={16} className="text-yellow-400"/> Sabotage Lights</button>
                    <button onClick={() => handleSabotage(SabotageType.REACTOR)} className="bg-slate-800 text-white p-3 rounded-r-xl border-l-4 border-red-500 active:scale-95 flex items-center gap-2 hover:bg-slate-700 shadow-lg font-bold text-sm"><Flame size={16} className="text-red-400"/> Sabotage Reactor</button>
                </div>
            )}
            
            <div className="absolute top-14 right-4 flex flex-col gap-2 pointer-events-auto z-50"> 
                <button onClick={() => setShowLeaveMenu(true)} className="bg-slate-200 p-3 rounded-xl border-b-4 border-slate-400 hover:bg-white active:border-b-0 active:translate-y-1 shadow-lg"><Settings size={24} className="text-slate-800"/></button> 
                <button onClick={toggleMap} className="bg-slate-200 p-3 rounded-xl border-b-4 border-slate-400 hover:bg-white active:border-b-0 active:translate-y-1 shadow-lg"><MapIcon size={24} className="text-slate-800"/></button> 
                <button onClick={() => setShowFriends(!showFriends)} className="bg-slate-200 p-3 rounded-xl border-b-4 border-slate-400 hover:bg-white active:border-b-0 active:translate-y-1 shadow-lg"><UserPlus size={24} className="text-slate-800"/></button>
            </div> 
        </div>
      )}

      {(activeTask || fixingSabotage) && ( <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50"> <div className="bg-slate-800 p-8 rounded-xl border-4 border-slate-600 w-96 text-center text-white shadow-2xl transform skew-x-[-2deg]"> <div className="skew-x-[2deg]"><h2 className="text-xl font-black mb-4 uppercase">{activeTask ? activeTask.title : 'FIX SABOTAGE'}</h2> <div className="h-48 bg-black mb-6 flex items-center justify-center border-2 border-slate-500 relative rounded"> {activeTask ? renderInteractiveTask() : renderSabotageFix()} </div> <button onClick={() => { setActiveTask(null); setFixingSabotage(null); }} className="text-red-400 font-bold border-2 border-red-400 px-6 py-2 rounded hover:bg-red-900/50 uppercase">CLOSE</button> </div></div> </div> )}
      
      {showFriends && (
          <div className="absolute top-32 right-4 w-64 bg-slate-900 border-2 border-slate-600 rounded-xl p-4 z-50 pointer-events-auto shadow-xl">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white uppercase border-b border-slate-700 pb-2 w-full">Invite Friends</h3><button onClick={() => setShowFriends(false)}><X className="text-white" size={16}/></button></div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                  {JSON.parse(localStorage.getItem('sb_friends') || '[]').map((f: any) => (
                      <div key={f.name} className="flex justify-between items-center text-white bg-slate-800 p-2 rounded border border-slate-700">
                          <span className="text-sm font-bold">{f.name}</span>
                          <button onClick={() => inviteFriend(f.name)} className="bg-green-600 p-1 rounded hover:bg-green-500"><Mail size={14}/></button>
                      </div>
                  ))}
                  {JSON.parse(localStorage.getItem('sb_friends') || '[]').length === 0 && <div className="text-gray-500 text-xs">No friends added.</div>}
              </div>
          </div>
      )}

      {/* Meeting - Kept same but slightly styled */}
      {gameState === GameState.MEETING && ( <div className="absolute inset-0 bg-blue-900/95 flex flex-col z-50"> <div className="flex items-center justify-between p-4 bg-blue-950 shadow-lg border-b-4 border-black"> <div className="flex items-center gap-2"><AlertTriangle className="text-red-500"/><span className="text-white font-black text-2xl uppercase italic">{voteResults ? "VOTING ENDED" : `VOTING: ${meetingTimer}s`}</span></div> <button onClick={() => setShowChat(!showChat)} className="bg-slate-700 p-3 rounded-xl border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 text-white"><MessageSquare /></button> </div> <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2 content-start"> {players.map(p => { const hasVoted = Object.keys(votes).includes(p.id); return ( <div key={p.id} className={`bg-slate-800 p-2 rounded flex items-center justify-between border-2 ${p.isDead ? 'opacity-50 border-red-900 grayscale' : 'border-slate-600'}`}> <div className="flex items-center gap-2 cursor-pointer" onClick={() => addToFriends(p.name)}> <div className="w-8 h-8 rounded-full border border-black" style={{backgroundColor: p.color === PlayerColor.RAINBOW ? 'purple' : p.color}}></div> <span className="text-white font-bold text-sm truncate max-w-[80px]">{p.name}</span> {p.isDead && <Skull size={12} className="text-red-500"/>} <UserPlus size={12} className="text-green-400 ml-1 opacity-50 hover:opacity-100"/></div> <div className="flex items-center gap-1"> {voteResults && !p.isDead && (<div className="flex gap-1">{Object.entries(votes).filter(([v, t]) => t === p.id).map(([v]) => <div key={v} className="w-4 h-4 rounded-full border border-white" style={{backgroundColor: players.find(x=>x.id===v)?.color === PlayerColor.RAINBOW ? 'purple' : players.find(x=>x.id===v)?.color}}></div>)}</div>)} {!voteResults && !p.isDead && !players.find(x => x.id === myId)?.isDead && (<button onClick={() => handleVote(p.id)} disabled={!!votes[myId]} className="bg-red-600 text-white px-3 py-1 rounded font-bold text-xs hover:bg-red-500 border-b-2 border-red-800 active:border-b-0 active:translate-y-px">VOTE</button>)} {!voteResults && hasVoted && <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse border-2 border-green-300"></div>} </div> </div> ); })} </div> {!voteResults && (<div className="p-4 bg-blue-950 flex justify-center"><button onClick={() => handleVote('SKIP')} disabled={!!votes[myId]} className="bg-gray-500 text-white px-8 py-3 rounded-xl font-bold border-b-4 border-gray-700 active:border-b-0 active:translate-y-1">SKIP VOTE</button></div>)} {showChat && ( <div className="absolute top-16 right-4 w-72 h-96 bg-slate-900 border-2 border-slate-600 rounded-xl shadow-2xl flex flex-col z-50"> <div className="flex justify-between items-center p-3 bg-slate-800 border-b border-slate-700 rounded-t-xl"><span className="text-white font-bold text-sm uppercase">Emergency Chat</span><button onClick={() => setShowChat(false)}><XCircle size={16} className="text-gray-400 hover:text-white"/></button></div> <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-black/20">{chatMessages.map(msg => (<div key={msg.id} className="text-xs text-white bg-black/40 p-2 rounded border-l-2" style={{borderColor: msg.playerColor}}><span className="font-bold uppercase" style={{color: msg.playerColor === PlayerColor.RAINBOW ? 'purple' : msg.playerColor}}>{msg.playerName}: </span>{msg.text}</div>))}<div ref={chatEndRef} /></div> <div className="p-2 border-t border-slate-700 flex gap-1 bg-slate-800 rounded-b-xl"><input value={chatInput} onChange={e => setChatInput(e.target.value)} className="flex-1 bg-black text-white text-xs p-2 rounded border border-slate-600 outline-none focus:border-white" placeholder="Say something..." /><button onClick={handleChatSend} className="bg-blue-600 p-2 rounded hover:bg-blue-500"><Send size={14} className="text-white"/></button></div> </div> )} </div> )}
      {showLeaveMenu && ( <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[60]"> <div className="bg-slate-800 p-8 rounded-xl text-center border-4 border-slate-600 shadow-2xl"> <h2 className="text-white text-2xl font-black mb-6 uppercase">Leave Game?</h2> <div className="flex gap-4"><button onClick={onLeave} className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold border-b-4 border-red-800 active:border-b-0 active:translate-y-1">YES</button><button onClick={() => setShowLeaveMenu(false)} className="bg-gray-600 text-white px-8 py-3 rounded-xl font-bold border-b-4 border-gray-800 active:border-b-0 active:translate-y-1">NO</button></div> </div> </div> )}
      
      {/* End Screen - Refined */}
      {gameState === GameState.ENDED && ( 
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 animate-fade-in font-sans"> 
              <div className={`text-6xl sm:text-8xl font-black mb-8 italic transform -skew-x-12 tracking-tighter ${winner === 'IMPOSTOR' ? 'text-red-600 drop-shadow-[5px_5px_0_rgba(100,0,0,1)]' : 'text-blue-500 drop-shadow-[5px_5px_0_rgba(0,0,100,1)]'}`}>
                  {winner === 'IMPOSTOR' ? 'IMPOSTOR WINS' : 'CREWMATE WINS'}
              </div> 
              <div className="bg-slate-800 border-4 border-slate-600 rounded-xl p-8 w-full max-w-2xl flex flex-col gap-6 skew-x-[-2deg] shadow-2xl">
                  <div className="skew-x-[2deg]">
                      {/* XP Bar */}
                      <div className="mb-6">
                          <div className="flex justify-between text-white font-bold mb-2"><span>Sus Pass XP</span><span className="text-yellow-400">+{xpGained} XP</span></div>
                          <div className="h-8 bg-black rounded-full overflow-hidden border-2 border-slate-500 relative">
                              <div className="h-full bg-yellow-500 w-full animate-[width_1s_ease-out]" style={{width: '100%'}}></div>
                              <div className="absolute inset-0 flex items-center justify-center font-bold text-black text-shadow-none text-sm uppercase tracking-widest">LEVEL UP!</div>
                          </div>
                      </div>
                      {/* Trophies */}
                      <div className="flex items-center justify-between bg-purple-900/50 p-4 rounded-xl border-2 border-purple-500 mb-4">
                          <div className="flex items-center gap-4">
                              <div className="bg-purple-900 p-2 rounded-full"><Trophy size={32} className="text-purple-300"/></div>
                              <div>
                                  <div className="text-purple-300 text-xs font-bold uppercase tracking-wider">Sus Meter</div>
                                  <div className="text-white font-black text-2xl">+{trophiesGained}</div>
                              </div>
                          </div>
                      </div>
                      {/* Quests */}
                      {questsCompleted.length > 0 && (
                          <div className="bg-blue-900/30 p-4 rounded-xl border-2 border-blue-500">
                              <div className="text-blue-300 font-bold mb-2 uppercase text-xs tracking-wider">Quests Completed</div>
                              {questsCompleted.map(q => (
                                  <div key={q} className="flex items-center gap-2 text-white font-bold">
                                      <div className="bg-green-500 rounded-full p-1"><Check size={12} className="text-black"/></div> {q}
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
              <button onClick={onLeave} className="mt-12 bg-yellow-500 hover:bg-yellow-400 text-black px-16 py-4 rounded-full font-black text-2xl border-b-8 border-yellow-700 active:border-0 active:translate-y-2 transition-all transform hover:scale-105 uppercase tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.5)]">EXIT GAME</button> 
          </div> 
      )}
    </div>
  );
};