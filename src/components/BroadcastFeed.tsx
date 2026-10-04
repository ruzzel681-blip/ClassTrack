import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  where,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Broadcast, Classroom } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import { UserAvatar } from './UserAvatar';
import { Radio, Send, Copy, Check, Trash2, LogIn, BookOpen } from 'lucide-react';

interface BroadcastFeedProps {
  classrooms: Classroom[];
  onJoined: () => void;
}

export const BroadcastFeed: React.FC<BroadcastFeedProps> = ({ classrooms, onJoined }) => {
  const { userProfile } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  // composer (teachers)
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachClassId, setAttachClassId] = useState<string>('');
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // student actions
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        setBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Broadcast)));
        setLoading(false);
      },
      (err) => {
        console.error('Broadcast listener error:', err);
        setLoading(false);
      }
    );
  }, []);

  const myClasses = classrooms.filter((c) => c.teacherId === userProfile?.uid);

  // default to the teacher's first class so announcing a code is one click
  useEffect(() => {
    if (!attachClassId && myClasses.length > 0) setAttachClassId(myClasses[0].id);
  }, [myClasses.length]);

  if (!userProfile) return null;

  const isAdmin = userProfile.role === 'admin';
  const isTeacher = userProfile.role === 'teacher' || isAdmin;
  const canPost = isTeacher && userProfile.approved;

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || !content.trim()) return;
    setPosting(true);
    setMessage(null);
    try {
      const cls = myClasses.find((c) => c.id === attachClassId);
      const data: Record<string, any> = {
        title: title.trim() || 'Announcement',
        content: content.trim(),
        authorUid: userProfile.uid,
        authorName: userProfile.displayName,
        authorRole: userProfile.role,
        createdAt: new Date().toISOString(),
      };
      if (userProfile.avatar) data.authorAvatar = userProfile.avatar;
      if (cls) {
        data.classId = cls.id;
        data.className = cls.name;
        data.classCode = cls.joinCode;
      }
      await addDoc(collection(db, 'broadcasts'), data);
      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'ANNOUNCEMENT_POSTED',
        `Broadcast to all students: "${data.title}"${cls ? ` (join code ${cls.joinCode} for ${cls.name})` : ''}`,
        cls?.id
      );
      setTitle('');
      setContent('');
      setMessage('Broadcast sent to all students.');
    } catch (err: any) {
      console.error(err);
      setMessage(`Could not send broadcast: ${err.message}`);
    }
    setPosting(false);
  };

  const handleDelete = async (b: Broadcast) => {
    if (!confirm('Delete this broadcast?')) return;
    try {
      await deleteDoc(doc(db, 'broadcasts', b.id));
    } catch (err: any) {
      setMessage(`Could not delete: ${err.message}`);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const alreadyIn = (code?: string) => !!code && classrooms.some((c) => c.joinCode === code);

  const handleJoin = async (b: Broadcast) => {
    if (!b.classCode) return;
    setJoiningId(b.id);
    setMessage(null);
    try {
      const snap = await getDocs(query(collection(db, 'classes'), where('joinCode', '==', b.classCode)));
      if (snap.empty) {
        setMessage('That class no longer exists. Ask your teacher for a new code.');
        setJoiningId(null);
        return;
      }
      const classDoc = snap.docs[0];
      const classData = classDoc.data() as Classroom;
      if (classData.studentUids?.includes(userProfile.uid)) {
        setMessage('You are already in this class.');
        setJoiningId(null);
        return;
      }
      if (classData.blockedStudentUids?.includes(userProfile.uid)) {
        setMessage('You cannot join this class. Please contact your teacher.');
        setJoiningId(null);
        return;
      }
      await updateDoc(doc(db, 'classes', classDoc.id), {
        studentUids: [...(classData.studentUids || []), userProfile.uid],
        studentsMap: {
          ...(classData.studentsMap || {}),
          [userProfile.uid]: {
            uid: userProfile.uid,
            studentId: userProfile.studentId || 'N/A',
            displayName: userProfile.displayName,
            email: userProfile.email,
            joinedAt: new Date().toISOString(),
          },
        },
      });
      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_ADDED',
        `Joined class "${classData.name}" via broadcast (code ${b.classCode})`,
        classDoc.id
      );
      setMessage(`You joined ${classData.name}!`);
      onJoined();
    } catch (err: any) {
      console.error(err);
      setMessage(`Could not join: ${err.message}`);
    }
    setJoiningId(null);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
          <Radio className="w-5 h-5 text-sky-400" /> Broadcast
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          {isTeacher
            ? 'Message every student, even those who are not in a class yet, and share a class code so they can join.'
            : 'Messages from your teachers. If a teacher shares a class code, you can join right from here.'}
        </p>
      </div>

      {message && (
        <div className="text-xs font-mono bg-zinc-900 border border-zinc-700 text-zinc-300 p-2.5 rounded">{message}</div>
      )}

      {/* Composer */}
      {canPost && (
        <form onSubmit={handlePost} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            New broadcast to <span className="text-sky-400 font-bold">all students</span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="e.g. Join my Physics class using the code below!"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none"
          />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-[11px] font-mono text-zinc-300">
              <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              Share class code:
              <select
                value={attachClassId}
                onChange={(e) => setAttachClassId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">No code</option>
                {myClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.joinCode})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={posting || !content.trim()}
              className="px-4 py-2 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {posting ? 'Sending...' : 'Send to all students'}
            </button>
          </div>
        </form>
      )}

      {/* Feed */}
      {loading ? (
        <div className="py-10 text-center text-xs font-mono text-zinc-400">Loading broadcasts...</div>
      ) : broadcasts.length === 0 ? (
        <div className="py-10 text-center text-xs font-mono text-zinc-400 bg-zinc-900/40 rounded border border-zinc-800 p-4">
          No broadcasts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => {
            const joined = alreadyIn(b.classCode);
            const canDelete = canPost && (b.authorUid === userProfile.uid || isAdmin);
            return (
              <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <UserAvatar displayName={b.authorName} avatar={b.authorAvatar} size="md" role="teacher" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-zinc-100 truncate">{b.title}</div>
                      <div className="text-[11px] font-mono text-zinc-500">
                        {b.authorName} • {new Date(b.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(b)}
                      title="Delete broadcast"
                      className="p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-800 hover:bg-red-950/50 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{b.content}</p>

                {b.classCode && (
                  <div className="flex flex-wrap items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 font-mono text-xs">
                    <span className="text-zinc-400">Class:</span>
                    <span className="text-zinc-200 font-semibold">{b.className}</span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-zinc-400">Code:</span>
                    <span className="text-sky-300 font-bold tracking-widest">{b.classCode}</span>
                    <button
                      onClick={() => handleCopy(b.classCode!)}
                      className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCode === b.classCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedCode === b.classCode ? 'Copied' : 'Copy'}
                    </button>
                    {!isTeacher && (
                      <button
                        onClick={() => handleJoin(b)}
                        disabled={joined || joiningId === b.id}
                        className="sm:ml-auto px-3 py-1 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <LogIn className="w-3 h-3" />
                        {joined ? 'Joined' : joiningId === b.id ? 'Joining...' : 'Join class'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
