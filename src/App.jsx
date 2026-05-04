import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc,
} from 'firebase/firestore';
import {
  Calendar, MapPin, Clock, Users, Circle, Flame, Waves, ShieldCheck,
  Pencil, Trash2, Plus, Check, X, Settings,
} from 'lucide-react';
import logoSrc from './assets/logo.jpeg';

// --- DEFAULTS (used as Firestore seed and as local-only fallback) ---
const DEFAULT_PLAYERS = [
  "Nestor", "Mundo", "Elder", "Carlos Andino",
  "Yaddir Jr Guterrez", "Elmer Lovell", "Richard Ward",
];

const DEFAULT_GAMES = [
  { id: "1", date: "2026-05-03", day: "Sunday",   time: "12:30 PM", venue: "Casey's", opponent: "Kickoff" },
  { id: "2", date: "2026-05-05", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "No Aim No Shame" },
  { id: "3", date: "2026-05-12", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "One Shop One Kill" },
  { id: "4", date: "2026-05-24", day: "Sunday",   time: "7:00 PM",  venue: "Casey's", opponent: "Aurora's Woohoo" },
  { id: "5", date: "2026-05-26", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "Casey's Snipers" },
  { id: "6", date: "2026-05-28", day: "Thursday", time: "7:00 PM",  venue: "Storm",   opponent: "Storm Brotherhood" },
  { id: "7", date: "2026-06-02", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "Hustle and Muscle" },
  { id: "8", date: "2026-06-07", day: "Sunday",   time: "7:00 PM",  venue: "Casey's", opponent: "End Zone Shuters" },
];

// --- Firebase setup ---
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseConfig = envConfig.apiKey ? envConfig : {};
if (!firebaseConfig.apiKey && typeof window !== 'undefined' && window.__firebase_config) {
  try { firebaseConfig = JSON.parse(window.__firebase_config); } catch (e) { firebaseConfig = {}; }
}

const hasFirebaseConfig = !!firebaseConfig.apiKey;
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : (firebaseConfig.projectId || 'sharks-8ball-v2');

const COLORS = {
  teal: '#00a8a8',
  orange: '#ff4d00',
  black: '#0d0f0e',
  cardBg: '#ffffff',
  textDark: '#1a1a1a',
  textMuted: '#444444',
};

// --- Utilities ---
function dayFromDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', { weekday: 'long' });
  } catch (e) {
    return '';
  }
}

function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Firestore path helpers
const gamesRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'games');
const gameDoc = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'games', id);
const rosterDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'roster', 'list');
const metaDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'meta', 'init');
const attendanceCol = () => collection(db, 'artifacts', appId, 'public', 'data', 'attendance');
const attendanceDoc = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'attendance', id);

// --- Logo with white-background flood-fill removal ---
function TransparentLogo({ src, alt, className }) {
  const [processedSrc, setProcessedSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        const isWhite = (pi) => data[pi] > 235 && data[pi + 1] > 235 && data[pi + 2] > 235;

        const visited = new Uint8Array(w * h);
        const stack = [];
        const seed = (x, y) => {
          if (x < 0 || y < 0 || x >= w || y >= h) return;
          stack.push(y * w + x);
        };
        // Seed all 4 edges (not just corners) so trapped white near borders also clears.
        for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
        for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

        while (stack.length > 0) {
          const idx = stack.pop();
          if (visited[idx]) continue;
          visited[idx] = 1;
          const pi = idx * 4;
          if (!isWhite(pi)) continue;
          data[pi + 3] = 0;
          const x = idx % w;
          const y = (idx - x) / w;
          if (x + 1 < w) stack.push(idx + 1);
          if (x > 0) stack.push(idx - 1);
          if (y + 1 < h) stack.push(idx + w);
          if (y > 0) stack.push(idx - w);
        }

        ctx.putImageData(imageData, 0, 0);
        if (!cancelled) setProcessedSrc(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error('Logo processing failed:', e);
      }
    };
    img.onerror = () => console.error('Logo load failed');
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return <img src={processedSrc || src} alt={alt} className={className} />;
}

// --- App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingGameId, setEditingGameId] = useState(null);
  const [editingPlayerIdx, setEditingPlayerIdx] = useState(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');

  const loading = !auth ? false : (!attendanceLoaded || !gamesLoaded || !rosterLoaded);

  // --- Auth ---
  useEffect(() => {
    if (!auth) {
      // Local-only mode: load everything from localStorage with defaults.
      try {
        const a = localStorage.getItem('sharks-attendance');
        if (a) setAttendance(JSON.parse(a));
      } catch (e) { /* ignore */ }
      try {
        const g = localStorage.getItem('sharks-games');
        setGames(g ? JSON.parse(g) : DEFAULT_GAMES);
      } catch (e) { setGames(DEFAULT_GAMES); }
      try {
        const r = localStorage.getItem('sharks-roster');
        setPlayers(r ? JSON.parse(r) : DEFAULT_PLAYERS);
      } catch (e) { setPlayers(DEFAULT_PLAYERS); }
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Auth error:', err);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // --- One-shot seed: write defaults if meta/init is missing ---
  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const metaSnap = await getDoc(metaDoc());
        if (cancelled || metaSnap.exists()) return;
        await Promise.all(
          DEFAULT_GAMES.map((g) => setDoc(gameDoc(g.id), g))
        );
        await setDoc(rosterDoc(), { players: DEFAULT_PLAYERS });
        await setDoc(metaDoc(), { seeded: true, seededAt: Date.now() });
      } catch (err) {
        console.error('Seed error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // --- Subscribe: attendance ---
  useEffect(() => {
    if (!db || !user) return;
    const unsub = onSnapshot(
      attendanceCol(),
      (snap) => {
        const data = {};
        snap.forEach((d) => { data[d.id] = d.data().confirmed || []; });
        setAttendance(data);
        setAttendanceLoaded(true);
      },
      () => setAttendanceLoaded(true),
    );
    return () => unsub();
  }, [user]);

  // --- Subscribe: games ---
  useEffect(() => {
    if (!db || !user) return;
    const unsub = onSnapshot(
      gamesRef(),
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        setGames(list);
        setGamesLoaded(true);
      },
      () => setGamesLoaded(true),
    );
    return () => unsub();
  }, [user]);

  // --- Subscribe: roster ---
  useEffect(() => {
    if (!db || !user) return;
    const unsub = onSnapshot(
      rosterDoc(),
      (snap) => {
        if (snap.exists()) setPlayers(snap.data().players || []);
        setRosterLoaded(true);
      },
      () => setRosterLoaded(true),
    );
    return () => unsub();
  }, [user]);

  // --- Mutations: attendance ---
  const toggleAttendance = async (gameId, playerName) => {
    const current = attendance[gameId] || [];
    const updated = current.includes(playerName)
      ? current.filter((p) => p !== playerName)
      : [...current, playerName];

    if (db && user) {
      try {
        await setDoc(attendanceDoc(gameId), { confirmed: updated }, { merge: true });
      } catch (err) { console.error('Save error:', err); }
    } else {
      const next = { ...attendance, [gameId]: updated };
      setAttendance(next);
      try { localStorage.setItem('sharks-attendance', JSON.stringify(next)); } catch (e) { /* ignore */ }
    }
  };

  // --- Mutations: games ---
  const persistGamesLocal = (next) => {
    setGames(next);
    try { localStorage.setItem('sharks-games', JSON.stringify(next)); } catch (e) { /* ignore */ }
  };

  const addGame = async ({ date, time, venue, opponent }) => {
    if (!date || !time || !opponent.trim() || !venue.trim()) return false;
    const newGame = {
      id: genId(),
      date,
      time,
      venue: venue.trim(),
      opponent: opponent.trim(),
      day: dayFromDate(date),
    };
    if (db && user) {
      try {
        await setDoc(gameDoc(newGame.id), newGame);
        return true;
      } catch (err) { console.error('Add game error:', err); return false; }
    }
    persistGamesLocal([...games, newGame].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    return true;
  };

  const updateGame = async (id, patch) => {
    const merged = {
      ...patch,
      day: patch.date ? dayFromDate(patch.date) : undefined,
    };
    Object.keys(merged).forEach((k) => merged[k] === undefined && delete merged[k]);
    if (db && user) {
      try {
        await setDoc(gameDoc(id), merged, { merge: true });
        return true;
      } catch (err) { console.error('Update game error:', err); return false; }
    }
    persistGamesLocal(games.map((g) => g.id === id ? { ...g, ...merged } : g));
    return true;
  };

  const deleteGame = async (id) => {
    if (db && user) {
      try {
        await deleteDoc(gameDoc(id));
        await deleteDoc(attendanceDoc(id)).catch(() => { /* ok if missing */ });
        return true;
      } catch (err) { console.error('Delete game error:', err); return false; }
    }
    persistGamesLocal(games.filter((g) => g.id !== id));
    const nextAtt = { ...attendance };
    delete nextAtt[id];
    setAttendance(nextAtt);
    try { localStorage.setItem('sharks-attendance', JSON.stringify(nextAtt)); } catch (e) { /* ignore */ }
    return true;
  };

  // --- Mutations: roster ---
  const renamePlayer = async (oldName, rawNew) => {
    const newName = (rawNew || '').trim();
    if (!newName || newName === oldName) return false;
    if (players.includes(newName)) {
      alert(`A player named "${newName}" already exists.`);
      return false;
    }
    const nextPlayers = players.map((p) => p === oldName ? newName : p);

    if (db && user) {
      try {
        await setDoc(rosterDoc(), { players: nextPlayers });
        // Sweep attendance docs that contain the old name.
        await Promise.all(games.map(async (g) => {
          const att = attendance[g.id] || [];
          if (!att.includes(oldName)) return;
          const updated = att.map((p) => p === oldName ? newName : p);
          await setDoc(attendanceDoc(g.id), { confirmed: updated }, { merge: true });
        }));
        return true;
      } catch (err) { console.error('Rename error:', err); return false; }
    }

    setPlayers(nextPlayers);
    try { localStorage.setItem('sharks-roster', JSON.stringify(nextPlayers)); } catch (e) { /* ignore */ }
    const nextAtt = { ...attendance };
    Object.keys(nextAtt).forEach((gid) => {
      if (nextAtt[gid].includes(oldName)) {
        nextAtt[gid] = nextAtt[gid].map((p) => p === oldName ? newName : p);
      }
    });
    setAttendance(nextAtt);
    try { localStorage.setItem('sharks-attendance', JSON.stringify(nextAtt)); } catch (e) { /* ignore */ }
    return true;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f0e] flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-4"
          style={{ borderColor: COLORS.teal }}
        ></div>
      </div>
    );
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcomingGames = games.filter((g) => new Date(g.date) >= today);
  const nextGame = upcomingGames[0] || games[0];
  const nextPlayers = nextGame ? (attendance[nextGame.id] || []) : [];

  return (
    <div className="min-h-screen bg-[#0d0f0e] text-[#f4f7f6] font-sans pb-20">
      {/* Header */}
      <div className="relative pt-12 pb-8 text-center px-6">
        <div
          className="absolute top-0 left-0 w-full h-3"
          style={{ background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.teal}, ${COLORS.orange})` }}
        ></div>

        <div className="mb-6 flex justify-center">
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-orange-500 to-teal-500 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <TransparentLogo
              src={logoSrc}
              alt="San Pedro Sharks Logo"
              className="relative w-52 h-52 object-contain drop-shadow-[0_0_30px_rgba(0,168,168,0.3)]"
            />
          </div>
        </div>

        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-[#f4f7f6]">
          San Pedro <span style={{ color: COLORS.teal }}>Sharks</span>
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="h-px w-8 bg-gray-700"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500 italic">
            Official Attendance App
          </p>
          <div className="h-px w-8 bg-gray-700"></div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6">
        {/* Next Match */}
        {nextGame && (
          <div className="rounded-[2.5rem] p-8 mb-8 relative overflow-hidden bg-white shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none transform rotate-12">
              <Flame size={200} color={COLORS.orange} />
            </div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse"></span>
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-gray-700">
                    Next Battle
                  </span>
                </div>
                <h2 className="text-3xl font-black italic tracking-tight text-[#1a1a1a]">
                  Vs. {nextGame.opponent}
                </h2>
              </div>
              <div
                className="px-5 py-2 rounded-2xl text-white font-black text-[10px] uppercase shadow-lg shadow-orange-900/20"
                style={{ backgroundColor: COLORS.orange }}
              >
                Active
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-black text-xs mb-8 font-bold uppercase tracking-widest">
              <div className="flex items-center gap-3 bg-gray-100 p-3 rounded-2xl">
                <Calendar size={18} style={{ color: COLORS.teal }} />
                <span>{nextGame.day}, {nextGame.date}</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-100 p-3 rounded-2xl">
                <Clock size={18} style={{ color: COLORS.teal }} />
                <span>{nextGame.time}</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-100 p-3 rounded-2xl">
                <MapPin size={18} style={{ color: COLORS.teal }} />
                <span>{nextGame.venue}</span>
              </div>
            </div>

            <div className="mb-3 flex justify-between items-end px-1">
              <span className="text-[10px] uppercase tracking-widest font-black text-gray-800 italic underline decoration-teal-500 underline-offset-4">
                Roster Status
              </span>
              <span className="text-sm font-black" style={{ color: COLORS.teal }}>
                {nextPlayers.length} / {players.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 h-5 rounded-full overflow-hidden border border-gray-50 shadow-inner">
              <div
                className="h-full transition-all duration-1000 ease-in-out"
                style={{
                  width: `${players.length ? (nextPlayers.length / players.length) * 100 : 0}%`,
                  backgroundColor: COLORS.teal,
                }}
              ></div>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {nextPlayers.length > 0 ? (
                nextPlayers.map((p) => (
                  <div
                    key={p}
                    className="bg-white border-2 text-[10px] px-4 py-2.5 rounded-2xl font-black uppercase shadow-md flex items-center gap-2"
                    style={{ borderColor: COLORS.teal, color: COLORS.teal }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
                    {p}
                  </div>
                ))
              ) : (
                <div className="w-full text-center py-6 bg-gray-100 rounded-3xl text-[11px] font-black text-gray-600 uppercase tracking-[0.2em] italic border-2 border-dashed border-gray-300">
                  Awaiting Personnel
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manage / Done toggle */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => { setEditMode((v) => !v); setEditingGameId(null); setEditingPlayerIdx(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition border-2 ${
              editMode
                ? 'bg-teal-500 border-teal-500 text-white shadow-lg shadow-teal-900/30'
                : 'bg-transparent border-gray-700 text-gray-300 hover:border-teal-500 hover:text-teal-400'
            }`}
          >
            {editMode ? <><Check size={14} /> Done Editing</> : <><Settings size={14} /> Manage</>}
          </button>
        </div>

        {/* Edit-mode Roster */}
        {editMode && (
          <RosterEditor
            players={players}
            editingPlayerIdx={editingPlayerIdx}
            editingPlayerName={editingPlayerName}
            onStartEdit={(idx) => {
              setEditingPlayerIdx(idx);
              setEditingPlayerName(players[idx]);
            }}
            onChangeName={setEditingPlayerName}
            onCancel={() => { setEditingPlayerIdx(null); setEditingPlayerName(''); }}
            onSave={async () => {
              const ok = await renamePlayer(players[editingPlayerIdx], editingPlayerName);
              if (ok) { setEditingPlayerIdx(null); setEditingPlayerName(''); }
            }}
          />
        )}

        {/* Edit-mode Add Game */}
        {editMode && (
          <AddGameForm onSubmit={addGame} />
        )}

        {/* Schedule header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-0.5 flex-1 bg-gray-800 rounded-full"></div>
          <h3 className="text-[11px] font-black tracking-[0.3em] uppercase text-gray-500 italic">
            Full Schedule
          </h3>
          <div className="h-0.5 flex-1 bg-gray-800 rounded-full"></div>
        </div>

        {/* Game cards */}
        <div className="space-y-8">
          {games.length === 0 && (
            <div className="text-center text-gray-500 italic py-10 text-sm">
              No games scheduled. {editMode ? 'Add one above.' : 'Tap Manage to add a game.'}
            </div>
          )}
          {games.map((game) => {
            const confirmed = attendance[game.id] || [];
            const isPast = new Date(game.date) < today;
            const isEditing = editingGameId === game.id;

            return (
              <div
                key={game.id}
                className={`bg-white rounded-[2.5rem] overflow-hidden transition-all duration-300 ${
                  isPast && !editMode ? 'opacity-30 grayscale scale-[0.98]' : 'hover:scale-[1.02] shadow-2xl'
                }`}
              >
                <div className="p-7">
                  <div className="flex justify-between items-center mb-5">
                    <div
                      className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full ${
                        isPast ? 'bg-gray-200 text-gray-600' : 'bg-teal-50 text-teal-800'
                      }`}
                    >
                      {isPast ? 'Archive' : 'Scheduled'}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-gray-500 uppercase italic tracking-tighter">
                        {game.date}
                      </span>
                      {editMode && !isEditing && (
                        <>
                          <button
                            onClick={() => setEditingGameId(game.id)}
                            className="p-1.5 rounded-full bg-gray-100 hover:bg-teal-100 text-gray-700 transition"
                            title="Edit game"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm(`Delete game vs ${game.opponent} on ${game.date}?`)) {
                                await deleteGame(game.id);
                              }
                            }}
                            className="p-1.5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 transition"
                            title="Delete game"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <EditGameForm
                      game={game}
                      onCancel={() => setEditingGameId(null)}
                      onSave={async (patch) => {
                        const ok = await updateGame(game.id, patch);
                        if (ok) setEditingGameId(null);
                      }}
                    />
                  ) : (
                    <>
                      <h4 className="text-2xl font-black italic mb-3 tracking-tight text-[#1a1a1a]">
                        Vs. {game.opponent}
                      </h4>

                      <div className="flex gap-5 text-[10px] font-black text-gray-800 mb-8 uppercase tracking-[0.15em]">
                        <div className="flex items-center gap-2">
                          <Clock size={15} style={{ color: COLORS.teal }} /> {game.time}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={15} style={{ color: COLORS.teal }} /> {game.venue}
                        </div>
                      </div>

                      <div className="bg-gray-100 rounded-3xl p-5 border border-gray-200 shadow-inner">
                        <div className="flex items-center gap-2 mb-5">
                          <Users size={16} style={{ color: COLORS.teal }} />
                          <span className="text-[10px] uppercase tracking-widest font-black text-gray-700">
                            Personnel Status:
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {players.map((player) => {
                            const isConfirmed = confirmed.includes(player);
                            return (
                              <button
                                key={player}
                                onClick={() => toggleAttendance(game.id, player)}
                                disabled={isPast}
                                className={`flex items-center justify-between px-4 py-3.5 rounded-2xl text-[10px] font-black transition-all border-2 ${
                                  isConfirmed
                                    ? 'text-white border-transparent'
                                    : 'bg-white border-gray-200 text-gray-800 hover:border-teal-400'
                                }`}
                                style={
                                  isConfirmed
                                    ? { backgroundColor: COLORS.teal, boxShadow: `0 8px 20px -5px ${COLORS.teal}55` }
                                    : {}
                                }
                              >
                                <span className="truncate uppercase">{player}</span>
                                {isConfirmed ? (
                                  <ShieldCheck size={16} />
                                ) : (
                                  <Circle size={16} className="opacity-20" style={{ color: COLORS.teal }} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-20 text-center space-y-8">
          <div className="inline-flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 bg-black border border-gray-800 px-10 py-4 rounded-full shadow-lg">
            <Waves size={14} className="text-teal-500 animate-pulse" /> Personnel Roster v2.1
          </div>
          <div className="flex justify-center items-center gap-8 opacity-20 invert">
            <div className="w-12 h-12 rounded-full border-4 border-gray-400 flex items-center justify-center font-black text-gray-400 italic text-2xl">
              8
            </div>
            <div className="text-[11px] font-black uppercase tracking-[0.6em] text-gray-400 italic">
              San Pedro Sharks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function RosterEditor({ players, editingPlayerIdx, editingPlayerName, onStartEdit, onChangeName, onCancel, onSave }) {
  return (
    <div className="bg-white rounded-[2rem] p-6 mb-6 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} style={{ color: COLORS.teal }} />
        <span className="text-[10px] uppercase tracking-widest font-black text-gray-700">
          Team Roster — tap a name to rename
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {players.map((p, idx) => {
          const isEditing = editingPlayerIdx === idx;
          if (isEditing) {
            return (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  autoFocus
                  type="text"
                  value={editingPlayerName}
                  onChange={(e) => onChangeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSave();
                    if (e.key === 'Escape') onCancel();
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-teal-400 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-600"
                />
                <button onClick={onSave} className="p-2.5 rounded-full bg-teal-500 text-white hover:bg-teal-600 transition" title="Save">
                  <Check size={16} />
                </button>
                <button onClick={onCancel} className="p-2.5 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition" title="Cancel">
                  <X size={16} />
                </button>
              </div>
            );
          }
          return (
            <button
              key={idx}
              onClick={() => onStartEdit(idx)}
              className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-teal-50 hover:border-teal-300 border-2 border-gray-100 text-sm font-bold text-gray-800 uppercase tracking-wide transition text-left"
            >
              <span>{p}</span>
              <Pencil size={13} className="text-gray-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddGameForm({ onSubmit }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [venue, setVenue] = useState("Casey's");
  const [opponent, setOpponent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const ok = await onSubmit({
      date,
      time: formatTimeForDisplay(time),
      venue,
      opponent,
    });
    setSubmitting(false);
    if (ok) {
      setDate(''); setTime('19:00'); setVenue("Casey's"); setOpponent('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] p-6 mb-8 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Plus size={16} style={{ color: COLORS.teal }} />
        <span className="text-[10px] uppercase tracking-widest font-black text-gray-700">
          Add New Game
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-1 flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="col-span-1 flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Opponent</span>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Storm Brotherhood"
            required
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Venue</span>
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Casey's"
            required
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting || !date || !time || !venue.trim() || !opponent.trim()}
        className="mt-4 w-full py-3 rounded-2xl font-black uppercase tracking-widest text-sm text-white bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 transition shadow-lg shadow-teal-900/20"
      >
        {submitting ? 'Saving…' : 'Add Game'}
      </button>
    </form>
  );
}

function EditGameForm({ game, onSave, onCancel }) {
  const [date, setDate] = useState(game.date || '');
  const [time, setTime] = useState(parseTimeForInput(game.time));
  const [venue, setVenue] = useState(game.venue || '');
  const [opponent, setOpponent] = useState(game.opponent || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    await onSave({
      date,
      time: formatTimeForDisplay(time),
      venue: venue.trim(),
      opponent: opponent.trim(),
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Opponent</span>
        <input
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Venue</span>
        <input
          type="text"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className="px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 rounded-2xl font-black uppercase tracking-widest text-sm text-white bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-sm text-gray-700 bg-gray-200 hover:bg-gray-300 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Time helpers — store as "7:00 PM" but use HH:mm in <input type="time">.
function parseTimeForInput(display) {
  if (!display) return '';
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(display.trim());
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const mins = m[2];
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mins}`;
}

function formatTimeForDisplay(input) {
  if (!input) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(input);
  if (!m) return input;
  let h = parseInt(m[1], 10);
  const mins = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${mins} ${ampm}`;
}
