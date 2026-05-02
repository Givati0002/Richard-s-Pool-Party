import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Calendar, MapPin, Clock, Users, Circle, Flame, Waves, ShieldCheck } from 'lucide-react';
import logo from './assets/logo.svg';

// --- CONFIGURATION & DATA ---
const PLAYERS = [
  "Nestor", "Mundo", "Elder", "Carlos Andino",
  "Yaddir Jr Guterrez", "Elmer Lovell", "Richard Ward"
];

const GAMES = [
  { id: "1", date: "2026-05-03", day: "Sunday",   time: "12:30 PM", venue: "Casey's", opponent: "Kickoff" },
  { id: "2", date: "2026-05-05", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "No Aim No Shame" },
  { id: "3", date: "2026-05-12", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "One Shop One Kill" },
  { id: "4", date: "2026-05-24", day: "Sunday",   time: "7:00 PM",  venue: "Casey's", opponent: "Aurora's Woohoo" },
  { id: "5", date: "2026-05-26", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "Casey's Snipers" },
  { id: "6", date: "2026-05-28", day: "Thursday", time: "7:00 PM",  venue: "Storm",   opponent: "Storm Brotherhood" },
  { id: "7", date: "2026-06-02", day: "Tuesday",  time: "7:00 PM",  venue: "Casey's", opponent: "Hustle and Muscle" },
  { id: "8", date: "2026-06-07", day: "Sunday",   time: "7:00 PM",  venue: "Casey's", opponent: "End Zone Shuters" },
];

// Firebase setup (with safe fallbacks for local development).
const firebaseConfigRaw =
  typeof window !== 'undefined' && window.__firebase_config ? window.__firebase_config : '{}';
let firebaseConfig = {};
try {
  firebaseConfig = JSON.parse(firebaseConfigRaw);
} catch (e) {
  firebaseConfig = {};
}

const hasFirebaseConfig = !!firebaseConfig.apiKey;
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sharks-8ball-v2';

export default function App() {
  const [user, setUser] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  // Theme Colors extracted from logo
  const COLORS = {
    teal: '#00a8a8',
    orange: '#ff4d00',
    black: '#0d0f0e',
    cardBg: '#ffffff',
    textDark: '#1a1a1a',
    textMuted: '#444444',
  };

  useEffect(() => {
    if (!auth) {
      // No Firebase configured — run in local-only mode using localStorage.
      const saved = localStorage.getItem('sharks-attendance');
      if (saved) {
        try { setAttendance(JSON.parse(saved)); } catch (e) { /* ignore */ }
      }
      setLoading(false);
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
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    const attendanceRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendance');
    const unsubscribe = onSnapshot(
      attendanceRef,
      (snapshot) => {
        const data = {};
        snapshot.forEach((d) => { data[d.id] = d.data().confirmed || []; });
        setAttendance(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [user]);

  const toggleAttendance = async (gameId, playerName) => {
    const current = attendance[gameId] || [];
    const updated = current.includes(playerName)
      ? current.filter((p) => p !== playerName)
      : [...current, playerName];

    if (db && user) {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'attendance', gameId);
      try {
        await setDoc(docRef, { confirmed: updated }, { merge: true });
      } catch (err) {
        console.error("Save error", err);
      }
    } else {
      // Local fallback when Firebase isn't configured.
      const next = { ...attendance, [gameId]: updated };
      setAttendance(next);
      try { localStorage.setItem('sharks-attendance', JSON.stringify(next)); } catch (e) { /* ignore */ }
    }
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
  const nextGame = GAMES.find((g) => new Date(g.date) >= today) || GAMES[0];
  const nextPlayers = attendance[nextGame.id] || [];

  return (
    <div className="min-h-screen bg-[#0d0f0e] text-[#f4f7f6] font-sans pb-20">
      {/* Header with Logo */}
      <div className="relative pt-12 pb-8 text-center px-6">
        <div
          className="absolute top-0 left-0 w-full h-3"
          style={{
            background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.teal}, ${COLORS.orange})`,
          }}
        ></div>

        <div className="mb-6 flex justify-center">
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-orange-500 to-teal-500 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <img
              src={logo}
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
        {/* White Window: Next Match */}
        <div className="rounded-[2.5rem] p-8 mb-12 relative overflow-hidden bg-white shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
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
              {nextPlayers.length} / {PLAYERS.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 h-5 rounded-full overflow-hidden border border-gray-50 shadow-inner">
            <div
              className="h-full transition-all duration-1000 ease-in-out"
              style={{
                width: `${(nextPlayers.length / PLAYERS.length) * 100}%`,
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

        {/* Schedule Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-0.5 flex-1 bg-gray-800 rounded-full"></div>
          <h3 className="text-[11px] font-black tracking-[0.3em] uppercase text-gray-500 italic">
            Full Schedule
          </h3>
          <div className="h-0.5 flex-1 bg-gray-800 rounded-full"></div>
        </div>

        <div className="space-y-8">
          {GAMES.map((game) => {
            const confirmed = attendance[game.id] || [];
            const isPast = new Date(game.date) < today;

            return (
              <div
                key={game.id}
                className={`bg-white rounded-[2.5rem] overflow-hidden transition-all duration-300 ${
                  isPast ? 'opacity-30 grayscale scale-[0.98]' : 'hover:scale-[1.02] shadow-2xl'
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
                    <span className="text-[11px] font-black text-gray-500 uppercase italic tracking-tighter">
                      {game.date}
                    </span>
                  </div>

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
                      {PLAYERS.map((player) => {
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
                </div>
              </div>
            );
          })}
        </div>

        {/* Technical Footer */}
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
