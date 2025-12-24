import React, { useEffect, useState, useRef } from 'react';
import { PlayerColor, PlayerRole, UserProgress, GameAudioSettings, Friend, Cosmetic, Quest } from '../types';
import { COLORS, ACHIEVEMENTS, LOCKED_COLORS, COLOR_PRICES, COSMETICS, SEASON_1_REWARDS, SUS_METER_REWARDS, DAILY_QUESTS, SEASONAL_QUESTS } from '../constants';
import { Rocket, Trophy, HelpCircle, Check, Copy, ShoppingCart, Lock, Star, Users, User, Settings, FileText, X, Plus, Trash, Volume2, Music, Mail, Crown, Gauge, Gift, Shirt, Download, Upload, Save } from 'lucide-react';
import { audio } from '../services/audioManager';

interface MainMenuProps {
  onStart: (name: string, color: PlayerColor, code: string, isHost: boolean, mode: 'FREEPLAY' | 'ONLINE' | 'P2P', audioSettings: GameAudioSettings, role?: PlayerRole, serverUrl?: string) => void;
}

const DEFAULT_PROGRESS: UserProgress = {
    tasksCompleted: 0, kills: 0, winsCrew: 0, winsImp: 0, gamesPlayed: 0, sussyPoints: 500,
    unlockedColors: [], completedAchievements: [],
    susMeter: 0, susPassXp: 0, susPassTier: 1, inventory: [], activeQuests: [], lastDailyReset: 0,
    claimedPassRewards: [], claimedMeterRewards: []
};

type MenuState = 'MAIN' | 'PLAY_MODE' | 'INVENTORY' | 'SHOP' | 'SETTINGS' | 'FRIENDS' | 'STATS' | 'SUS_PASS' | 'SUS_METER' | 'QUESTS';

export const MainMenu: React.FC<MainMenuProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState<PlayerColor>('#C51111'); 
  const [menuState, setMenuState] = useState<MenuState>('MAIN');
  const [inventoryTab, setInventoryTab] = useState<'COLORS' | 'HATS' | 'SKINS' | 'PETS'>('COLORS');
  const [roomCode, setRoomCode] = useState('');
  const [progress, setProgress] = useState<UserProgress>(DEFAULT_PROGRESS);
  const [serverUrl, setServerUrl] = useState('ws://localhost:8080');
  const [userId, setUserId] = useState('');
  
  // Settings & Invites
  const [audioSettings, setAudioSettings] = useState<GameAudioSettings>({ musicVolume: 0.5, sfxVolume: 0.5 });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [invite, setInvite] = useState<{host: string, code: string} | null>(null);
  const [friendRequest, setFriendRequest] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lobbyWs = useRef<WebSocket | null>(null);

  // Load persistence
  useEffect(() => {
      // 1. Load or Generate ID
      let storedId = localStorage.getItem('sb_user_id');
      if (!storedId) {
          storedId = Math.random().toString(36).substring(2, 10).toUpperCase();
          localStorage.setItem('sb_user_id', storedId);
      }
      setUserId(storedId);

      // 2. Load Name
      const storedName = localStorage.getItem('sb_name');
      if (storedName) setName(storedName);
      else setName('Baka');

      // 3. Load Progress by ID
      const key = `sb_progress_${storedId}`;
      const storedProgress = localStorage.getItem(key);
      let loadedProgress = DEFAULT_PROGRESS;
      if (storedProgress) {
          loadedProgress = JSON.parse(storedProgress);
      }
      
      // Daily Quest Reset Logic
      const now = Date.now();
      if (now - loadedProgress.lastDailyReset > 24 * 60 * 60 * 1000) {
          loadedProgress.activeQuests = [
              ...DAILY_QUESTS.map(q => ({...q, current: 0, claimed: false})),
              ...SEASONAL_QUESTS.map(q => {
                  const existing = loadedProgress.activeQuests.find(eq => eq.id === q.id);
                  return existing ? existing : {...q, current: 0, claimed: false};
              })
          ];
          loadedProgress.lastDailyReset = now;
      }
      
      setProgress(loadedProgress);
      
      const storedAudio = localStorage.getItem('sb_audio');
      if (storedAudio) {
          const s = JSON.parse(storedAudio);
          setAudioSettings(s);
          audio.setVolumes(s.musicVolume, s.sfxVolume);
      }

      const storedFriends = localStorage.getItem('sb_friends');
      if (storedFriends) setFriends(JSON.parse(storedFriends));

  }, []);

  const saveProgress = (newP: UserProgress) => {
      setProgress(newP);
      if (userId) {
          localStorage.setItem(`sb_progress_${userId}`, JSON.stringify(newP));
      }
  }

  // WS Connect
  useEffect(() => {
      const connect = () => {
          if (lobbyWs.current) lobbyWs.current.close();
          try {
              const ws = new WebSocket(serverUrl);
              lobbyWs.current = ws;
              ws.onopen = () => {
                  ws.send(JSON.stringify({ type: 'REGISTER_PLAYER', name }));
              };
              ws.onmessage = (e) => {
                  try {
                      const data = JSON.parse(e.data);
                      if (data.type === 'INVITE_RECEIVED') {
                          audio.playTaskComplete();
                          setInvite({ host: data.hostName, code: data.roomCode });
                      }
                      if (data.type === 'FRIEND_REQUEST_RECEIVED') {
                          audio.playTaskComplete();
                          setFriendRequest(data.from);
                      }
                      if (data.type === 'FRIEND_ACCEPTED') {
                          const newFriend = { name: data.from, addedAt: Date.now() };
                          setFriends(prev => {
                              if(prev.some(f => f.name === newFriend.name)) return prev;
                              const upd = [...prev, newFriend];
                              localStorage.setItem('sb_friends', JSON.stringify(upd));
                              return upd;
                          });
                          alert(`${data.from} accepted your friend request!`);
                      }
                  } catch(err) {}
              };
          } catch (e) {}
      };
      connect();
      const interval = setInterval(() => {
          if (lobbyWs.current?.readyState === WebSocket.OPEN) {
              lobbyWs.current.send(JSON.stringify({ type: 'REGISTER_PLAYER', name }));
          } else {
              connect();
          }
      }, 3000);
      return () => clearInterval(interval);
  }, [name, serverUrl]);

  const saveAudio = (s: GameAudioSettings) => {
      setAudioSettings(s);
      audio.setVolumes(s.musicVolume, s.sfxVolume);
      localStorage.setItem('sb_audio', JSON.stringify(s));
  }

  const handleNameChange = (val: string) => {
      setName(val);
      localStorage.setItem('sb_name', val);
      
      // CHEAT CODE
      if (val === "/SIRE SIROL\\") {
          audio.playTaskComplete();
          const cheatProgress = {
              ...progress,
              sussyPoints: 999999,
              susPassXp: 999999,
              susMeter: 50000,
              susPassTier: 100,
              unlockedColors: [...LOCKED_COLORS],
              inventory: COSMETICS.map(c => c.id)
          };
          saveProgress(cheatProgress);
          alert("DEV ACCESS GRANTED: Max Resources Unlocked");
      }
  };

  const sendFriendRequest = () => {
      if(!newFriendName.trim()) return;
      if(lobbyWs.current?.readyState === WebSocket.OPEN) {
          lobbyWs.current.send(JSON.stringify({ type: 'FRIEND_REQUEST', from: name, to: newFriendName }));
          alert(`Sent request to ${newFriendName}`);
          setNewFriendName('');
      } else {
          alert("Not connected to server");
      }
  };

  const acceptFriend = () => {
      if(!friendRequest) return;
      const newFriend = { name: friendRequest, addedAt: Date.now() };
      const updated = [...friends, newFriend];
      setFriends(updated);
      localStorage.setItem('sb_friends', JSON.stringify(updated));
      lobbyWs.current?.send(JSON.stringify({ type: 'FRIEND_ACCEPT', from: name, to: friendRequest }));
      setFriendRequest(null);
  }

  const removeFriend = (fname: string) => {
      const updated = friends.filter(f => f.name !== fname);
      setFriends(updated);
      localStorage.setItem('sb_friends', JSON.stringify(updated));
  }

  const buyItem = (item: Cosmetic | { id: string, price: number }) => {
      if (progress.sussyPoints >= item.price) {
          saveProgress({
              ...progress,
              sussyPoints: progress.sussyPoints - item.price,
              inventory: [...progress.inventory, item.id]
          });
          audio.playTaskComplete();
      }
  };

  const buyColor = (c: string) => {
      const cost = COLOR_PRICES[c];
      if (progress.sussyPoints >= cost) {
          saveProgress({
              ...progress,
              sussyPoints: progress.sussyPoints - cost,
              unlockedColors: [...progress.unlockedColors, c]
          });
          audio.playTaskComplete();
      }
  };

  const claimPassReward = (tier: number, reward: any) => {
      if (progress.susPassTier >= tier && !progress.claimedPassRewards.includes(tier)) {
          let updates: any = { claimedPassRewards: [...progress.claimedPassRewards, tier] };
          if (reward.rewardType === 'CURRENCY') updates.sussyPoints = progress.sussyPoints + reward.value;
          if (reward.rewardType === 'COSMETIC') updates.inventory = [...progress.inventory, reward.id];
          saveProgress({ ...progress, ...updates });
          audio.playTaskComplete();
      }
  };

  const claimMeterReward = (trophies: number, reward: any) => {
      if (progress.susMeter >= trophies && !progress.claimedMeterRewards.includes(trophies)) {
          let updates: any = { claimedMeterRewards: [...progress.claimedMeterRewards, trophies] };
          if (reward.rewardType === 'CURRENCY') updates.sussyPoints = progress.sussyPoints + reward.value;
          if (reward.rewardType === 'COSMETIC') updates.inventory = [...progress.inventory, reward.id];
          saveProgress({ ...progress, ...updates });
          audio.playTaskComplete();
      }
  };

  const handleJoinGame = (code: string) => { 
      if (code.length > 0) {
          audio.playClick();
          onStart(name, color as PlayerColor, code, false, 'P2P', audioSettings, undefined, serverUrl); 
      }
  };

  const handleCreateGame = () => {
      audio.playClick();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      onStart(name, color as PlayerColor, code, true, 'P2P', audioSettings, undefined, serverUrl);
  };

  const handleSaveData = () => {
      const dataStr = JSON.stringify(progress, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sussie_baka_save_${name}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      audio.playTaskComplete();
  };

  const handleUploadClick = () => {
      if (fileInputRef.current) {
          fileInputRef.current.click();
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const importedData = JSON.parse(event.target?.result as string);
              // Basic validation
              if (typeof importedData.sussyPoints === 'number' && Array.isArray(importedData.inventory)) {
                  saveProgress(importedData);
                  alert("Save data loaded successfully!");
                  audio.playTaskComplete();
              } else {
                  alert("Invalid save file.");
              }
          } catch (err) {
              alert("Error reading file.");
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input
  };

  const renderSidebarButton = (label: string, icon: React.ReactNode, onClick: () => void, colorClass: string) => (
      <button onClick={() => { audio.playClick(); onClick(); }} className={`w-full ${colorClass} text-white font-bold text-lg sm:text-xl py-4 px-6 rounded-none skew-x-[-10deg] border-b-8 border-r-8 active:border-0 active:translate-y-2 active:translate-x-2 transition-all flex items-center justify-center gap-2 shadow-lg mb-4 transform hover:scale-105`}>
          <div className="skew-x-[10deg] flex items-center gap-2 w-full justify-center">
              {icon} <span>{label}</span>
          </div>
      </button>
  );

  // Helper for rendering preview character
  const CharacterPreview = ({ size = 'large' }: { size?: 'small' | 'large' }) => (
      <div className={`relative ${size === 'large' ? 'w-32 h-40' : 'w-16 h-20'} flex items-center justify-center`}>
          {/* Base Body */}
          <div className={`absolute w-3/4 h-3/4 rounded-full border-2 border-black z-10`} style={{background: color === 'RAINBOW' ? 'linear-gradient(45deg, red, blue)' : color}}></div>
          {/* Visor */}
          <div className={`absolute w-1/2 h-1/3 bg-sky-300 rounded-full border-2 border-black z-30 translate-x-2 -translate-y-2`}></div>
          {/* Backpack */}
          <div className={`absolute w-1/4 h-2/3 rounded border-2 border-black z-0 -translate-x-6`} style={{background: color === 'RAINBOW' ? 'linear-gradient(45deg, red, blue)' : color}}></div>
          
          {/* Skin Overlay */}
          {progress.equippedSkin && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  {/* Simplified visual representation of skin ownership */}
                  {progress.equippedSkin.includes('suit') && <div className="w-2/3 h-1/2 bg-gray-900 absolute mt-4 rounded-b-xl border border-white/20"></div>}
                  {progress.equippedSkin.includes('lab') && <div className="w-2/3 h-1/2 bg-white absolute mt-4 rounded-b-xl border border-gray-300"></div>}
                  {progress.equippedSkin.includes('steam') && <div className="w-2/3 h-1/2 bg-amber-800 absolute mt-4 rounded-b-xl border border-amber-600"></div>}
              </div>
          )}

          {/* Hat Overlay */}
          {progress.equippedHat && (
              <div className="absolute -top-6 z-40 text-4xl">
                  {progress.equippedHat.includes('tophat') && '🎩'}
                  {progress.equippedHat.includes('crown') && '👑'}
                  {progress.equippedHat.includes('goggles') && '🥽'}
                  {progress.equippedHat.includes('halo') && '😇'}
                  {!progress.equippedHat.includes('tophat') && !progress.equippedHat.includes('crown') && !progress.equippedHat.includes('goggles') && !progress.equippedHat.includes('halo') && '🧢'}
              </div>
          )}
      </div>
  );

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col relative overflow-hidden font-sans select-none">
      {/* Background */}
      <div className="absolute inset-0 z-0 bg-black">
          <div className="absolute inset-0 opacity-50" style={{backgroundImage: `url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')`, backgroundSize: 'cover', backgroundPosition: 'center'}}></div>
          {[...Array(50)].map((_, i) => (
              <div key={i} className="absolute bg-white rounded-full animate-pulse" style={{
                  top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, 
                  width: `${Math.random() * 3}px`, height: `${Math.random() * 3}px`,
                  animationDuration: `${Math.random() * 5 + 1}s`
              }}></div>
          ))}
      </div>

      {/* Top Bar */}
      <div className="relative z-20 w-full bg-slate-800/80 border-b-4 border-black p-2 flex justify-between items-center backdrop-blur">
          <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden relative bg-black/50">
                  <CharacterPreview size="small"/>
              </div>
              <div className="flex flex-col">
                  <input value={name} onChange={e => handleNameChange(e.target.value)} className="bg-transparent text-white font-bold text-xl outline-none border-b border-transparent focus:border-white w-40 uppercase" maxLength={15} placeholder="ENTER NAME"/>
                  <div className="text-[10px] text-gray-400 font-mono">ID: {userId}</div>
              </div>
          </div>
          <div className="flex gap-4 text-white font-mono text-sm">
              <div className="flex items-center gap-1 text-yellow-400 bg-black/50 px-3 py-1 rounded"><Star size={14}/> {progress.sussyPoints}</div>
              <div className="flex items-center gap-1 text-purple-400 bg-black/50 px-3 py-1 rounded"><Trophy size={14}/> {progress.susMeter}</div>
              <button onClick={() => setMenuState('QUESTS')} className="bg-blue-600 px-6 py-1 rounded font-bold skew-x-[-10deg] border-b-4 border-blue-800 hover:brightness-110 active:border-0 active:translate-y-1"><span className="skew-x-[10deg]">QUESTS</span></button>
              <button onClick={() => setMenuState('FRIENDS')} className="bg-green-600 px-6 py-1 rounded font-bold skew-x-[-10deg] border-b-4 border-green-800 hover:brightness-110 active:border-0 active:translate-y-1"><span className="skew-x-[10deg]">FRIENDS</span></button>
          </div>
      </div>

      {/* Modals */}
      {invite && (
          <div className="absolute top-20 right-4 z-50 bg-slate-800 border-2 border-green-500 p-4 rounded shadow-xl animate-bounce">
              <div className="text-white font-bold mb-2">{invite.host} invited you!</div>
              <div className="flex gap-2">
                  <button onClick={() => handleJoinGame(invite.code)} className="bg-green-600 text-white px-4 py-1 rounded text-sm">JOIN</button>
                  <button onClick={() => setInvite(null)} className="bg-red-600 text-white px-4 py-1 rounded text-sm">IGNORE</button>
              </div>
          </div>
      )}
      {friendRequest && (
          <div className="absolute top-20 right-4 z-50 bg-slate-800 border-2 border-blue-500 p-4 rounded shadow-xl animate-pulse">
              <div className="text-white font-bold mb-2">{friendRequest} wants to be friends!</div>
              <div className="flex gap-2">
                  <button onClick={acceptFriend} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">ACCEPT</button>
                  <button onClick={() => setFriendRequest(null)} className="bg-red-600 text-white px-4 py-1 rounded text-sm">IGNORE</button>
              </div>
          </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 flex">
          {menuState === 'MAIN' && (
              <div className="w-full h-full flex flex-col md:flex-row items-center justify-center gap-12 p-8">
                  <div className="flex flex-col items-center">
                      <h1 className="text-8xl font-black text-white italic tracking-tighter drop-shadow-[0_5px_0_#000]" style={{textShadow: '5px 5px 0px #000'}}>SUSSIE BAKA</h1>
                  </div>
                  <div className="flex flex-col w-72 gap-2">
                      {renderSidebarButton("PLAY", <Rocket size={28}/>, () => setMenuState('PLAY_MODE'), "bg-cyan-500 border-cyan-700")}
                      {renderSidebarButton("SUS PASS", <Crown size={28}/>, () => setMenuState('SUS_PASS'), "bg-yellow-500 border-yellow-700")}
                      {renderSidebarButton("SUS METER", <Gauge size={28}/>, () => setMenuState('SUS_METER'), "bg-purple-500 border-purple-700")}
                      {renderSidebarButton("INVENTORY", <User size={28}/>, () => setMenuState('INVENTORY'), "bg-slate-500 border-slate-700")}
                      {renderSidebarButton("SHOP", <ShoppingCart size={28}/>, () => setMenuState('SHOP'), "bg-slate-500 border-slate-700")}
                      <div className="grid grid-cols-2 gap-2 mt-4">
                          <button onClick={() => setMenuState('SETTINGS')} className="bg-slate-600 p-2 border-b-4 border-slate-800 rounded flex justify-center text-white hover:brightness-110"><Settings/></button>
                          <button onClick={() => setMenuState('STATS')} className="bg-slate-600 p-2 border-b-4 border-slate-800 rounded flex justify-center text-white hover:brightness-110"><Trophy/></button>
                      </div>
                  </div>
              </div>
          )}

          {menuState !== 'MAIN' && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-slate-800 border-4 border-slate-600 w-full max-w-5xl h-[85vh] rounded-xl flex flex-col overflow-hidden relative shadow-2xl">
                      <button onClick={() => { audio.playClick(); setMenuState('MAIN'); }} className="absolute top-4 right-4 z-50 text-red-500 hover:text-white"><X size={32}/></button>
                      
                      {menuState === 'PLAY_MODE' && (
                          <div className="flex flex-col h-full items-center justify-center gap-8 p-8">
                              <h2 className="text-4xl font-black text-white uppercase mb-8">Select Mode</h2>
                              <div className="flex flex-wrap justify-center gap-8 w-full">
                                  <div className="bg-slate-900 p-6 rounded-xl border-4 border-slate-700 w-64 hover:border-white transition-colors cursor-pointer group" onClick={() => { audio.playClick(); onStart(name, color, 'FREEPLAY', true, 'FREEPLAY', audioSettings); }}>
                                      <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-cyan-400">FREEPLAY</h3>
                                      <p className="text-gray-400 text-sm">Practice tasks and impostor kills with bots.</p>
                                  </div>
                                  <div className="bg-slate-900 p-6 rounded-xl border-4 border-slate-700 w-64 hover:border-white transition-colors cursor-pointer group" onClick={handleCreateGame}>
                                      <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-400">HOST GAME</h3>
                                      <p className="text-gray-400 text-sm">Create a P2P room and invite friends via code.</p>
                                  </div>
                              </div>
                              <div className="mt-8 flex gap-2">
                                  <input type="text" placeholder="ENTER CODE" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} className="bg-slate-900 border-2 border-slate-600 text-white p-4 font-mono text-center text-xl uppercase rounded outline-none focus:border-white w-48"/>
                                  <button onClick={() => handleJoinGame(roomCode)} className="bg-green-600 hover:bg-green-500 text-white font-bold px-8 rounded">JOIN</button>
                              </div>
                          </div>
                      )}

                      {/* ... (Other menu states like SUS_PASS, SUS_METER, QUESTS kept same but omitted for brevity if no changes needed) */}
                      {menuState === 'SUS_PASS' && (
                          <div className="flex flex-col h-full bg-slate-800">
                              <div className="bg-[url('https://img.freepik.com/free-vector/steampunk-background-with-mechanical-gears-cogs_107791-17366.jpg')] bg-cover h-48 w-full flex items-center justify-center border-b-4 border-black relative">
                                  <div className="absolute inset-0 bg-black/50"></div>
                                  <div className="relative text-center">
                                      <h2 className="text-5xl font-black text-amber-500 drop-shadow-lg font-mono">SEASON 1: STEAMPUNK</h2>
                                      <div className="text-white mt-2 font-bold">Ends in 30 Days</div>
                                  </div>
                              </div>
                              <div className="p-4 bg-slate-900 flex justify-between text-white font-bold border-b border-slate-700">
                                  <span>TIER {progress.susPassTier}</span>
                                  <span>XP: {progress.susPassXp} / {progress.susPassTier * 1000}</span>
                              </div>
                              <div className="flex-1 overflow-x-auto p-8 flex items-center gap-4">
                                  {SEASON_1_REWARDS.map(r => {
                                      const claimed = progress.claimedPassRewards.includes(r.tier);
                                      const unlocked = progress.susPassTier >= r.tier;
                                      return (
                                          <div key={r.tier} className={`flex-shrink-0 w-48 h-64 rounded-xl border-4 flex flex-col items-center justify-between p-4 relative ${claimed ? 'bg-slate-900 border-green-600 opacity-50' : unlocked ? 'bg-slate-700 border-yellow-500 animate-pulse' : 'bg-slate-800 border-slate-600'}`}>
                                              <div className="text-2xl font-black text-white">TIER {r.tier}</div>
                                              <div className="text-center">
                                                  {r.rewardType === 'CURRENCY' ? <Star size={48} className="text-yellow-400 mx-auto"/> : <Gift size={48} className="text-purple-400 mx-auto"/>}
                                                  <div className="text-white font-bold mt-2 text-sm">{r.label}</div>
                                              </div>
                                              <button disabled={!unlocked || claimed} onClick={() => claimPassReward(r.tier, r)} className={`w-full py-2 font-bold rounded ${claimed ? 'bg-green-800 text-white' : unlocked ? 'bg-yellow-500 text-black' : 'bg-slate-600 text-gray-400'}`}>
                                                  {claimed ? 'CLAIMED' : unlocked ? 'CLAIM' : 'LOCKED'}
                                              </button>
                                          </div>
                                      )
                                  })}
                              </div>
                          </div>
                      )}

                      {menuState === 'SUS_METER' && (
                          <div className="flex flex-col h-full bg-slate-900 p-8">
                              <h2 className="text-4xl font-black text-purple-400 uppercase mb-4 text-center">Sus Meter Road</h2>
                              <div className="text-center text-white text-2xl font-bold mb-8">Current Trophies: {progress.susMeter}</div>
                              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                                  {SUS_METER_REWARDS.map(r => {
                                      const claimed = progress.claimedMeterRewards.includes(r.trophies);
                                      const unlocked = progress.susMeter >= r.trophies;
                                      return (
                                          <div key={r.trophies} className={`w-full p-4 rounded-xl border-2 flex items-center justify-between ${claimed ? 'bg-slate-900 border-green-600 opacity-50' : unlocked ? 'bg-slate-800 border-purple-500' : 'bg-slate-800 border-slate-700 opacity-60'}`}>
                                              <div className="flex items-center gap-4">
                                                  <div className="bg-purple-900 p-2 rounded text-white font-bold">{r.trophies} 🏆</div>
                                                  <div className="text-white font-bold">{r.label}</div>
                                              </div>
                                              <button disabled={!unlocked || claimed} onClick={() => claimMeterReward(r.trophies, r)} className={`px-6 py-2 font-bold rounded ${claimed ? 'bg-green-800 text-white' : unlocked ? 'bg-purple-500 text-white' : 'bg-slate-600 text-gray-400'}`}>
                                                  {claimed ? 'CLAIMED' : unlocked ? 'CLAIM' : 'LOCKED'}
                                              </button>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      {menuState === 'QUESTS' && (
                          <div className="flex flex-col h-full p-8 bg-slate-900">
                              <h2 className="text-3xl font-black text-white uppercase mb-6 text-center">Quest Log</h2>
                              <div className="flex-1 overflow-y-auto space-y-4 max-w-3xl mx-auto w-full">
                                  {progress.activeQuests.map(q => {
                                      const isComplete = q.current >= q.target;
                                      return (
                                          <div key={q.id} className={`p-6 rounded-xl border-2 flex items-center justify-between ${isComplete ? 'bg-slate-800 border-green-500' : 'bg-slate-800 border-slate-600'}`}>
                                              <div>
                                                  <div className="text-sm text-yellow-400 font-bold mb-1">{q.type}</div>
                                                  <div className="text-white font-bold text-xl">{q.description}</div>
                                                  <div className="text-gray-400 mt-2">Progress: {q.current} / {q.target}</div>
                                              </div>
                                              <div className="flex flex-col items-end gap-2">
                                                  <div className="text-purple-400 font-bold">+{q.xpReward} XP</div>
                                                  {isComplete && <div className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold flex items-center gap-1"><Check size={16}/> COMPLETED</div>}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      {menuState === 'INVENTORY' && (
                          <div className="flex flex-col h-full p-8">
                              <div className="flex items-center justify-between mb-4">
                                  <h2 className="text-3xl font-black text-white uppercase">Inventory</h2>
                                  <div className="scale-75 origin-right"><CharacterPreview/></div>
                              </div>
                              
                              {/* Inventory Tabs */}
                              <div className="flex gap-2 mb-6 border-b border-slate-600 pb-2">
                                  {['COLORS', 'HATS', 'SKINS', 'PETS'].map(tab => (
                                      <button key={tab} onClick={() => setInventoryTab(tab as any)} className={`px-4 py-2 font-bold rounded-t-lg transition-colors ${inventoryTab === tab ? 'bg-slate-700 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}>
                                          {tab}
                                      </button>
                                  ))}
                              </div>

                              <div className="flex gap-4 mb-4 text-sm bg-black/20 p-2 rounded">
                                  <div className="text-white">Hat: <span className="font-bold text-yellow-400">{COSMETICS.find(c => c.id === progress.equippedHat)?.name || 'None'}</span></div>
                                  <div className="text-white">Skin: <span className="font-bold text-cyan-400">{COSMETICS.find(c => c.id === progress.equippedSkin)?.name || 'None'}</span></div>
                                  <div className="text-white">Pet: <span className="font-bold text-green-400">{COSMETICS.find(c => c.id === progress.equippedPet)?.name || 'None'}</span></div>
                              </div>

                              <div className="flex-1 overflow-y-auto grid grid-cols-4 md:grid-cols-6 gap-4 p-4 bg-black/30 rounded">
                                  {inventoryTab === 'COLORS' && COLORS.map(c => {
                                      const isLocked = LOCKED_COLORS.includes(c) && !progress.unlockedColors.includes(c);
                                      return (
                                          <button key={c} onClick={() => { if(!isLocked) { setColor(c); audio.playClick(); }}} disabled={isLocked} className={`aspect-square rounded-full border-4 transition-all relative ${color === c ? 'border-white scale-110 shadow-[0_0_15px_white]' : 'border-transparent opacity-80'} ${isLocked ? 'opacity-30 grayscale' : 'hover:opacity-100'}`} style={{background: c === 'RAINBOW' ? 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)' : c}}>
                                              {isLocked && <Lock className="absolute inset-0 m-auto text-black/50"/>}
                                          </button>
                                      );
                                  })}
                                  {inventoryTab !== 'COLORS' && COSMETICS.filter(c => c.type === inventoryTab.slice(0, -1)).map(item => { // Slice removes 'S' from HATS -> HAT
                                      const owned = progress.inventory.includes(item.id);
                                      if(!owned) return null;
                                      const equipped = progress.equippedHat === item.id || progress.equippedSkin === item.id || progress.equippedPet === item.id;
                                      return (
                                          <div key={item.id} onClick={() => {
                                              if(item.type === 'HAT') saveProgress({...progress, equippedHat: item.id});
                                              if(item.type === 'SKIN') saveProgress({...progress, equippedSkin: item.id});
                                              if(item.type === 'PET') saveProgress({...progress, equippedPet: item.id});
                                              audio.playClick();
                                          }} className={`aspect-square rounded border-2 flex flex-col items-center justify-center p-2 cursor-pointer ${equipped ? 'border-green-500 bg-green-900/20' : 'border-slate-600 bg-slate-800'}`}>
                                              <div className="text-xs text-gray-400">{item.type}</div>
                                              <div className="font-bold text-white text-center text-sm">{item.name}</div>
                                              {equipped && <Check size={16} className="text-green-500 mt-1"/>}
                                          </div>
                                      );
                                  })}
                                  {inventoryTab !== 'COLORS' && COSMETICS.filter(c => c.type === inventoryTab.slice(0, -1) && progress.inventory.includes(c.id)).length === 0 && 
                                      <div className="col-span-full text-center text-gray-500 p-4">Visit Shop to unlock more!</div>
                                  }
                              </div>
                          </div>
                      )}

                      {menuState === 'SHOP' && (
                          <div className="flex flex-col h-full p-8">
                              <div className="flex justify-between items-center mb-6">
                                  <h2 className="text-3xl font-black text-white uppercase">Shop</h2>
                                  <div className="text-yellow-400 font-bold text-xl flex items-center gap-2 bg-slate-900 px-4 py-2 rounded"><Star/> {progress.sussyPoints} PTS</div>
                              </div>
                              <div className="flex-1 overflow-y-auto grid grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-black/30 rounded">
                                  {LOCKED_COLORS.map(c => {
                                      if(progress.unlockedColors.includes(c)) return null;
                                      const price = COLOR_PRICES[c];
                                      return (
                                          <div key={c} className="bg-slate-700 p-4 rounded-xl flex flex-col items-center gap-3 border-2 border-slate-600">
                                              <div className="w-12 h-12 rounded-full border-2" style={{background: c === 'RAINBOW' ? 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)' : c}}></div>
                                              <div className="text-white font-bold text-sm">Color: {c}</div>
                                              <button onClick={() => buyColor(c)} disabled={progress.sussyPoints < price} className={`font-bold px-4 py-2 rounded text-sm w-full transition-colors ${progress.sussyPoints >= price ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>{price} PTS</button>
                                          </div>
                                      );
                                  })}
                                  {COSMETICS.map(item => {
                                      if(progress.inventory.includes(item.id)) return null;
                                      return (
                                          <div key={item.id} className="bg-slate-700 p-4 rounded-xl flex flex-col items-center gap-3 border-2 border-slate-600">
                                              <div className="text-sm text-gray-400 font-mono uppercase">{item.type}</div>
                                              <div className="font-bold text-white text-center h-12 flex items-center justify-center text-lg leading-tight">{item.name}</div>
                                              <button onClick={() => buyItem(item)} disabled={progress.sussyPoints < item.price} className={`font-bold px-4 py-2 rounded text-sm w-full transition-colors ${progress.sussyPoints >= item.price ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>{item.price} PTS</button>
                                          </div>
                                      );
                                  })}
                                  {LOCKED_COLORS.every(c => progress.unlockedColors.includes(c)) && COSMETICS.every(i => progress.inventory.includes(i.id)) && <div className="text-white text-center col-span-full">You have bought everything!</div>}
                              </div>
                          </div>
                      )}

                      {menuState === 'SETTINGS' && (
                          <div className="flex flex-col h-full p-8 items-center justify-center">
                              <h2 className="text-3xl font-black text-white uppercase mb-8">Settings</h2>
                              <div className="w-full max-w-md space-y-8 bg-slate-700 p-8 rounded-xl border border-slate-500">
                                  <div className="space-y-2">
                                      <div className="flex justify-between text-white font-bold"><span className="flex items-center gap-2"><Music/> Music Volume</span> <span>{Math.round(audioSettings.musicVolume * 100)}%</span></div>
                                      <input type="range" min="0" max="1" step="0.1" value={audioSettings.musicVolume} onChange={e => saveAudio({...audioSettings, musicVolume: parseFloat(e.target.value)})} className="w-full accent-cyan-500 h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer"/>
                                  </div>
                                  <div className="space-y-2">
                                      <div className="flex justify-between text-white font-bold"><span className="flex items-center gap-2"><Volume2/> SFX Volume</span> <span>{Math.round(audioSettings.sfxVolume * 100)}%</span></div>
                                      <input type="range" min="0" max="1" step="0.1" value={audioSettings.sfxVolume} onChange={e => saveAudio({...audioSettings, sfxVolume: parseFloat(e.target.value)})} className="w-full accent-cyan-500 h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer"/>
                                  </div>
                                  <div className="border-t border-slate-600 pt-6">
                                      <h3 className="text-white font-bold mb-4 uppercase text-sm">Data Management</h3>
                                      <div className="flex gap-4">
                                          <button onClick={handleSaveData} className="flex-1 bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-500 flex items-center justify-center gap-2">
                                              <Download size={18} /> Save Data
                                          </button>
                                          <button onClick={handleUploadClick} className="flex-1 bg-green-600 text-white py-3 rounded font-bold hover:bg-green-500 flex items-center justify-center gap-2">
                                              <Upload size={18} /> Upload Data
                                          </button>
                                          <input 
                                              type="file" 
                                              ref={fileInputRef} 
                                              onChange={handleFileChange} 
                                              className="hidden" 
                                              accept=".json"
                                          />
                                      </div>
                                      <p className="text-gray-400 text-xs mt-2 text-center">Save/Upload your progress file manually if local storage fails.</p>
                                  </div>
                              </div>
                          </div>
                      )}

                      {menuState === 'FRIENDS' && (
                          <div className="flex flex-col h-full p-8">
                              <h2 className="text-3xl font-black text-white uppercase mb-4">Friends List</h2>
                              <div className="flex gap-2 mb-4">
                                  <input value={newFriendName} onChange={e => setNewFriendName(e.target.value)} placeholder="Send Friend Request" className="bg-slate-900 border border-slate-600 p-2 text-white flex-1 rounded"/>
                                  <button onClick={sendFriendRequest} className="bg-blue-600 p-2 rounded text-white flex items-center gap-2"><Mail size={16}/> Send Request</button>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-2">
                                  {friends.length === 0 && <div className="text-gray-500 text-center">No friends added.</div>}
                                  {friends.map(f => (
                                      <div key={f.name} className="bg-slate-700 p-3 rounded flex justify-between items-center text-white">
                                          <span className="font-bold">{f.name}</span>
                                          <button onClick={() => removeFriend(f.name)} className="text-red-400 hover:text-red-300"><Trash size={16}/></button>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {menuState === 'STATS' && (
                          <div className="flex flex-col h-full p-8">
                              <h2 className="text-3xl font-black text-white uppercase mb-6">Statistics & Achievements</h2>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                  <div className="bg-slate-700 p-3 rounded text-center"><div className="text-gray-400 text-xs uppercase">Games</div><div className="text-2xl font-bold text-white">{progress.gamesPlayed}</div></div>
                                  <div className="bg-slate-700 p-3 rounded text-center"><div className="text-gray-400 text-xs uppercase">Wins (Crew)</div><div className="text-2xl font-bold text-green-400">{progress.winsCrew}</div></div>
                                  <div className="bg-slate-700 p-3 rounded text-center"><div className="text-gray-400 text-xs uppercase">Wins (Imp)</div><div className="text-2xl font-bold text-red-400">{progress.winsImp}</div></div>
                                  <div className="bg-slate-700 p-3 rounded text-center"><div className="text-gray-400 text-xs uppercase">Kills</div><div className="text-2xl font-bold text-white">{progress.kills}</div></div>
                              </div>
                              <h3 className="text-xl font-bold text-white mb-4">Achievements ({progress.completedAchievements.length}/{ACHIEVEMENTS.length})</h3>
                              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                  {ACHIEVEMENTS.map(ach => {
                                      const done = progress.completedAchievements.includes(ach.id);
                                      return (
                                          <div key={ach.id} className={`p-4 rounded border-l-4 flex justify-between items-center ${done ? 'bg-slate-700 border-green-500' : 'bg-slate-800 border-gray-600 opacity-60'}`}>
                                              <div>
                                                  <div className={`font-bold ${done ? 'text-green-400' : 'text-gray-300'}`}>{ach.title}</div>
                                                  <div className="text-sm text-gray-400">{ach.description}</div>
                                              </div>
                                              <div className="text-right">
                                                  <div className="text-yellow-400 font-bold text-xs">+{ach.reward} PTS</div>
                                                  {done && <Check size={16} className="text-green-500 ml-auto"/>}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};