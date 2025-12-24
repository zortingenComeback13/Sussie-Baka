import React, { useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { GameEngine } from './components/GameEngine';
import { PlayerColor, PlayerRole, GameAudioSettings } from './types';

function App() {
  const [inGame, setInGame] = useState(false);
  const [config, setConfig] = useState<{name: string, color: PlayerColor, code: string, isHost: boolean, mode: 'FREEPLAY' | 'ONLINE' | 'P2P', role?: PlayerRole, serverUrl?: string}>({
      name: '',
      color: PlayerColor.RED,
      code: '',
      isHost: false,
      mode: 'FREEPLAY'
  });

  // Updated signature to match MainMenu call: (name, color, code, isHost, mode, audioSettings, role?, serverUrl?)
  const handleStart = (name: string, color: PlayerColor, code: string, isHost: boolean, mode: 'FREEPLAY' | 'ONLINE' | 'P2P', audioSettings: GameAudioSettings, role?: PlayerRole, serverUrl?: string) => {
      // audioSettings are handled by singleton in MainMenu, just ensuring arguments align correctly here
      setConfig({ name, color, code, isHost, mode, role, serverUrl });
      setInGame(true);
  };

  const handleLeave = () => {
      setInGame(false);
  };

  return (
    <div className="antialiased">
      {!inGame ? (
        <MainMenu onStart={handleStart} />
      ) : (
        <GameEngine 
            playerName={config.name}
            playerColor={config.color}
            roomCode={config.code}
            isHost={config.isHost}
            onLeave={handleLeave}
            gameMode={config.mode}
            initialRole={config.role}
            serverUrl={config.serverUrl}
        />
      )}
    </div>
  );
}

export default App;