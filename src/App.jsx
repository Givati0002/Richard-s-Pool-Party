import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc,
} from 'firebase/firestore';
import {
  Calendar, MapPin, Clock, Users, Circle, Flame, Waves, ShieldCheck,
  Pencil, Trash2, Plus, Check, X, Settings, Undo2, Redo2,
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

const STACK_LIMIT = 30;

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

// Parse "YYYY-MM-DD" as local-midnight Date so timezone offsets don't make
// today's game appear past on the day of the game (notably for users west
// of UTC, where new Date("2026-05-04") parses to the previous local day).
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
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

// Build an undo/redo pair: each closure runs its op and returns the opposite closure.
function makeUndoPair(undoOp, redoOp) {
  let undoFn, redoFn;
  undoFn = async () => { await undoOp(); return redoFn; };
  redoFn = async () => { await redoOp(); return undoFn; };
  return undoFn;
}

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

  // Undo/Redo: stacks of closures held in refs (mutable, no re-render),
  // plus a counter that bumps to re-render the buttons when stacks change.
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [, setStackVer] = useState(0);
  const bumpStack = useCallback(() => setStackVer((v) => v + 1), []);

  const pushUndo = useCallback((fn, { clearRedo = true } = {}) => {
    undoStackRef.current.push(fn);
    if (undoStackRef.current.length > STACK_LIMIT) undoStackRef.current.shift();
    if (clearRedo) redoStackRef.current = [];
    bumpStack();
  }, [bumpStack]);

  const loading = !auth ? false : (!attendanceLoaded || !gamesLoaded || !rosterLoaded);

  // --- Auth ---
  useEffect(() => {
    if (!auth) {
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

  // --- One-shot seed ---
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

  // --- Subscriptions ---
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

  // --- Pure persistence helpers (no undo bookkeeping) ---
  const persistAttendance = useCallback(async (gameId, confirmed) => {
    if (db && user) {
      await setDoc(attendanceDoc(gameId), { confirmed }, { merge: true });
    } else {
      setAttendance((prev) => {
        const next = { ...prev, [gameId]: confirmed };
        try { localStorage.setItem('sharks-attendance', JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
    }
  }, [user]);

  const persistGame = useCallback(async (game) => {
    if (db && user) {
      await setDoc(gameDoc(game.id), game);
    } else {
      setGames((prev) => {
        const next = prev.filter((g) => g.id !== game.id).concat(game)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        try { localStorage.setItem('sharks-games', JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
    }
  }, [user]);

  const persistDeleteGame = useCallback(async (id) => {
    if (db && user) {
      await deleteDoc(gameDoc(id));
      await deleteDoc(attendanceDoc(id)).catch(() => { /* ok if missing */ });
    } else {
      setGames((prev) => {
        const next = prev.filter((g) => g.id !== id);
        try { localStorage.setItem('sharks-games', JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      setAttendance((prev) => {
        const next = { ...prev };
        delete next[id];
        try { localStorage.setItem('sharks-attendance', JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
    }
  }, [user]);

  const persistRoster = useCallback(async (newPlayers) => {
    if (db && user) {
      await setDoc(rosterDoc(), { players: newPlayers });
    } else {
      setPlayers(newPlayers);
      try { localStorage.setItem('sharks-roster', JSON.stringify(newPlayers)); } catch (e) { /* ignore */ }
    }
  }, [user]);

  // --- Public mutation helpers ---

  const toggleAttendance = useCallback(async (gameId, playerName) => {
    const before = [...(attendance[gameId] || [])];
    const after = before.includes(playerName)
      ? before.filter((p) => p !== playerName)
      : [...before, playerName];
    try {
      await persistAttendance(gameId, after);
    } catch (err) { console.error('Toggle error:', err); return; }
    pushUndo(makeUndoPair(
      async () => { await persistAttendance(gameId, before); },
      async () => { await persistAttendance(gameId, after); },
    ));
  }, [attendance, persistAttendance, pushUndo]);

  const addGame = useCallback(async ({ date, time, venue, opponent }) => {
    if (!date || !time || !opponent.trim() || !venue.trim()) return false;
    const newGame = {
      id: genId(),
      date,
      time,
      venue: venue.trim(),
      opponent: opponent.trim(),
      day: dayFromDate(date),
    };
    try {
      await persistGame(newGame);
    } catch (err) { console.error('Add game error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => { await persistDeleteGame(newGame.id); },
      async () => { await persistGame(newGame); },
    ));
    return true;
  }, [persistGame, persistDeleteGame, pushUndo]);

  const updateGame = useCallback(async (id, patch) => {
    const oldGame = games.find((g) => g.id === id);
    if (!oldGame) return false;
    const merged = {
      ...oldGame,
      ...patch,
      day: patch.date ? dayFromDate(patch.date) : oldGame.day,
    };
    try {
      await persistGame(merged);
    } catch (err) { console.error('Update game error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => { await persistGame(oldGame); },
      async () => { await persistGame(merged); },
    ));
    return true;
  }, [games, persistGame, pushUndo]);

  const deleteGame = useCallback(async (id) => {
    const oldGame = games.find((g) => g.id === id);
    if (!oldGame) return false;
    const oldAttendance = [...(attendance[id] || [])];
    try {
      await persistDeleteGame(id);
    } catch (err) { console.error('Delete game error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => {
        await persistGame(oldGame);
        if (oldAttendance.length > 0) await persistAttendance(id, oldAttendance);
      },
      async () => { await persistDeleteGame(id); },
    ));
    return true;
  }, [games, attendance, persistDeleteGame, persistGame, persistAttendance, pushUndo]);

  const renamePlayer = useCallback(async (oldName, rawNew) => {
    const newName = (rawNew || '').trim();
    if (!newName || newName === oldName) return false;
    if (players.includes(newName)) {
      alert(`A player named "${newName}" already exists.`);
      return false;
    }
    const oldRoster = [...players];
    const newRoster = players.map((p) => p === oldName ? newName : p);
    const swaps = [];
    games.forEach((g) => {
      const att = attendance[g.id] || [];
      if (att.includes(oldName)) {
        swaps.push({
          gid: g.id,
          before: [...att],
          after: att.map((p) => p === oldName ? newName : p),
        });
      }
    });
    try {
      await persistRoster(newRoster);
      await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.after)));
    } catch (err) { console.error('Rename error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => {
        await persistRoster(oldRoster);
        await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.before)));
      },
      async () => {
        await persistRoster(newRoster);
        await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.after)));
      },
    ));
    return true;
  }, [players, games, attendance, persistRoster, persistAttendance, pushUndo]);

  const addPlayer = useCallback(async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return false;
    if (players.includes(name)) {
      alert(`A player named "${name}" already exists.`);
      return false;
    }
    const oldRoster = [...players];
    const newRoster = [...players, name];
    try {
      await persistRoster(newRoster);
    } catch (err) { console.error('Add player error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => { await persistRoster(oldRoster); },
      async () => { await persistRoster(newRoster); },
    ));
    return true;
  }, [players, persistRoster, pushUndo]);

  const removePlayer = useCallback(async (name) => {
    if (!players.includes(name)) return false;
    const oldRoster = [...players];
    const newRoster = players.filter((p) => p !== name);
    const swaps = [];
    games.forEach((g) => {
      const att = attendance[g.id] || [];
      if (att.includes(name)) {
        swaps.push({
          gid: g.id,
          before: [...att],
          after: att.filter((p) => p !== name),
        });
      }
    });
    try {
      await persistRoster(newRoster);
      await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.after)));
    } catch (err) { console.error('Remove player error:', err); return false; }
    pushUndo(makeUndoPair(
      async () => {
        await persistRoster(oldRoster);
        await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.before)));
      },
      async () => {
        await persistRoster(newRoster);
        await Promise.all(swaps.map((s) => persistAttendance(s.gid, s.after)));
      },
    ));
    return true;
  }, [players, games, attendance, persistRoster, persistAttendance, pushUndo]);

  // --- Undo / Redo ---
  const onUndo = useCallback(async () => {
    const fn = undoStackRef.current.pop();
    if (!fn) return;
    bumpStack();
    try {
      const redoFn = await fn();
      redoStackRef.current.push(redoFn);
      if (redoStackRef.current.length > STACK_LIMIT) redoStackRef.current.shift();
    } catch (err) {
      console.error('Undo failed:', err);
    }
    bumpStack();
  }, [bumpStack]);

  const onRedo = useCallback(async () => {
    const fn = redoStackRef.current.pop();
    if (!fn) return;
    bumpStack();
    try {
      const undoFn = await fn();
      undoStackRef.current.push(undoFn);
      if (undoStackRef.current.length > STACK_LIMIT) undoStackRef.current.shift();
    } catch (err) {
      console.error('Redo failed:', err);
    }
    bumpStack();
  }, [bumpStack]);

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const tag = (target && target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo(); else onUndo();
      } else if (key === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onUndo, onRedo]);

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
  const upcomingGames = games.filter((g) => parseLocalDate(g.date) >= today);
  const nextGame = upcomingGames[0] || games[0];
  const nextPlayers = nextGame ? (attendance[nextGame.id] || []) : [];
  const undoCount = undoStackRef.current.length;
  const redoCount = redoStackRef.current.length;

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

        {/* Top toolbar: Undo/Redo + Manage */}
        <div className="mb-6 flex justify-between items-center gap-2">
          <div className="flex gap-2">
            <button
              onClick={onUndo}
              disabled={undoCount === 0}
              title="Undo (Ctrl+Z)"
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition border-2 ${
                undoCount === 0
                  ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                  : 'border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white'
              }`}
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              onClick={onRedo}
              disabled={redoCount === 0}
              title="Redo (Ctrl+Shift+Z)"
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition border-2 ${
                redoCount === 0
                  ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                  : 'border-teal-500 text-teal-400 hover:bg-teal-500 hover:text-white'
              }`}
            >
              <Redo2 size={14} /> Redo
            </button>
          </div>
          <button
            onClick={() => { setEditMode((v) => !v); setEditingGameId(null); setEditingPlayerIdx(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition border-2 ${
              editMode
                ? 'bg-teal-500 border-teal-500 text-white shadow-lg shadow-teal-900/30'
                : 'bg-transparent border-gray-700 text-gray-300 hover:border-teal-500 hover:text-teal-400'
            }`}
          >
            {editMode ? <><Check size={14} /> Done</> : <><Settings size={14} /> Manage</>}
          </button>
        </div>

        {/* Edit-mode Roster */}
        {editMode && (
          <RosterEditor
            players={players}
            editingPlayerIdx={editingPlayerIdx}
            editingPlayerName={editingPlayerName}
            onStartEdit={(idx) => { setEditingPlayerIdx(idx); setEditingPlayerName(players[idx]); }}
            onChangeName={setEditingPlayerName}
            onCancel={() => { setEditingPlayerIdx(null); setEditingPlayerName(''); }}
            onSave={async () => {
              const ok = await renamePlayer(players[editingPlayerIdx], editingPlayerName);
              if (ok) { setEditingPlayerIdx(null); setEditingPlayerName(''); }
            }}
            onAdd={addPlayer}
            onRemove={async (name) => {
              if (window.confirm(`Remove ${name} from the roster?`)) {
                await removePlayer(name);
              }
            }}
          />
        )}

        {/* Edit-mode Add Game */}
        {editMode && <AddGameForm onSubmit={addGame} />}

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
            const isPast = parseLocalDate(game.date) < today;
            const isEditing = editingGameId === game.id;

            return (
              <div
                key={game.id}
                className={`bg-white rounded-[2.5rem] overflow-hidden transition-all duration-300 ${
                  isPast ? 'opacity-60 scale-[0.98]' : 'hover:scale-[1.02] shadow-2xl'
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
                      {!isEditing && (
                        <button
                          onClick={() => setEditingGameId(game.id)}
                          className="p-1.5 rounded-full bg-gray-100 hover:bg-teal-100 text-gray-700 transition"
                          title="Edit game"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {editMode && !isEditing && (
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

                        {players.length === 0 ? (
                          <div className="text-[11px] font-black text-gray-500 italic text-center py-4">
                            No players in roster. Tap Manage to add players.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {players.map((player) => {
                              const isConfirmed = confirmed.includes(player);
                              return (
                                <button
                                  key={player}
                                  onClick={() => toggleAttendance(game.id, player)}
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
                        )}
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

function RosterEditor({
  players, editingPlayerIdx, editingPlayerName,
  onStartEdit, onChangeName, onCancel, onSave,
  onAdd, onRemove,
}) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    if (!newName.trim() || adding) return;
    setAdding(true);
    const ok = await onAdd(newName);
    setAdding(false);
    if (ok) setNewName('');
  };

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
            <div key={idx} className="flex items-center gap-2">
              <button
                onClick={() => onStartEdit(idx)}
                className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-teal-50 hover:border-teal-300 border-2 border-gray-100 text-sm font-bold text-gray-800 uppercase tracking-wide transition text-left"
              >
                <span>{p}</span>
                <Pencil size={13} className="text-gray-400" />
              </button>
              <button
                onClick={() => onRemove(p)}
                className="p-2.5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 transition"
                title={`Remove ${p}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add player form */}
      <form onSubmit={submitAdd} className="mt-4 flex gap-2 items-center pt-4 border-t border-gray-200">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New player name…"
          className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          disabled={!newName.trim() || adding}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-black uppercase text-[11px] tracking-widest transition"
        >
          <Plus size={14} /> Add
        </button>
      </form>
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
