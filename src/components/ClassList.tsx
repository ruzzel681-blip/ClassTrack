import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import {
  Plus,
  KeyRound,
  Users,
  Copy,
  Check,
  Trash2,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

interface ClassListProps {
  onSelectClassroom: (classroom: Classroom) => void;
}

export const ClassList: React.FC<ClassListProps> = ({ onSelectClassroom }) => {
  const { userProfile } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Form states
  const [className, setClassName] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      let q;
      if (isTeacher) {
        q = query(collection(db, 'classes'), where('teacherId', '==', userProfile.uid));
      } else {
        q = query(
          collection(db, 'classes'),
          where('studentUids', 'array-contains', userProfile.uid)
        );
      }

      const snap = await getDocs(q);
      const list: Classroom[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as object) } as Classroom);
      });

      // Sort newest first
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setClassrooms(list);
    } catch (err) {
      console.error('Error fetching classrooms:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClassrooms();
  }, [userProfile]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    try {
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const docRef = await addDoc(collection(db, 'classes'), {
        name: className.trim(),
        section: section.trim(),
        subject: subject.trim(),
        teacherId: userProfile.uid,
        teacherName: userProfile.displayName,
        joinCode,
        studentUids: [],
        createdAt: new Date().toISOString(),
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'CLASS_CREATED',
        `Created class "${className.trim()}" (Code: ${joinCode})`,
        docRef.id
      );

      setShowCreateModal(false);
      setClassName('');
      setSection('');
      setSubject('');
      await fetchClassrooms();
    } catch (err) {
      console.error('Error creating class:', err);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;

    try {
      const q = query(collection(db, 'classes'), where('joinCode', '==', code));
      const snap = await getDocs(q);

      if (snap.empty) {
        setJoinError('Invalid Join Code. Please verify with your teacher.');
        return;
      }

      const classDoc = snap.docs[0];
      const classData = classDoc.data() as Classroom;

      if (classData.studentUids?.includes(userProfile.uid)) {
        setJoinError('You are already enrolled in this class.');
        return;
      }

      const updatedStudentUids = [...(classData.studentUids || []), userProfile.uid];
      const updatedStudentsMap = {
        ...(classData.studentsMap || {}),
        [userProfile.uid]: {
          uid: userProfile.uid,
          studentId: userProfile.studentId || 'N/A',
          displayName: userProfile.displayName,
          email: userProfile.email,
          joinedAt: new Date().toISOString(),
        },
      };

      await updateDoc(doc(db, 'classes', classDoc.id), {
        studentUids: updatedStudentUids,
        studentsMap: updatedStudentsMap,
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_ADDED',
        `Joined class "${classData.name}" via code ${code}`,
        classDoc.id
      );

      setShowJoinModal(false);
      setJoinCodeInput('');
      await fetchClassrooms();
    } catch (err) {
      console.error('Error joining class:', err);
      setJoinError('Failed to join class. Please try again.');
    }
  };

  const handleDeleteClass = async (classId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete class "${name}"? This action is permanent.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'classes', classId));
      await fetchClassrooms();
    } catch (err) {
      console.error('Failed to delete class:', err);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-6">
        <div>
          <h1 className="text-xl font-mono font-bold text-zinc-100 uppercase tracking-tight">
            Classroom Directory
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-0.5">
            {isTeacher
              ? 'Manage your active classroom sections, attendance rosters & assignments'
              : 'Select your enrolled course section to view attendance, announcements & assignments'}
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {isTeacher && userProfile.approved && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 rounded bg-sky-900/90 hover:bg-sky-800 border border-sky-700 text-sky-100 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Class
            </button>
          )}

          <button
            onClick={() => setShowJoinModal(true)}
            className="px-3.5 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            Join Class Code
          </button>
        </div>
      </div>

      {/* Classroom Table / Grid */}
      {loading ? (
        <div className="text-center py-12 font-mono text-xs text-zinc-400">
          Loading classroom directory...
        </div>
      ) : classrooms.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center font-mono text-xs">
          <BookOpen className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-zinc-200 uppercase mb-1">
            No Active Classrooms Found
          </h3>
          <p className="text-zinc-400 max-w-md mx-auto mb-6">
            {isTeacher
              ? 'Create a new class to get started with attendance tracking, roster management, and assignments.'
              : 'You have not joined any classes yet. Click "Join Class Code" and enter the 6-character code provided by your instructor.'}
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => (isTeacher ? setShowCreateModal(true) : setShowJoinModal(true))}
              className="px-4 py-2 rounded bg-sky-900 border border-sky-700 text-sky-100 font-semibold hover:bg-sky-800"
            >
              {isTeacher ? 'Create First Class' : 'Join Class with Code'}
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-900">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[11px] tracking-wider">
                <th className="py-3 px-4 font-semibold">Class Name</th>
                <th className="py-3 px-4 font-semibold">Section / Subject</th>
                <th className="py-3 px-4 font-semibold">Instructor</th>
                <th className="py-3 px-4 font-semibold">Enrolled</th>
                <th className="py-3 px-4 font-semibold">Join Code</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {classrooms.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-zinc-800/50 transition-colors group"
                >
                  <td className="py-3.5 px-4 font-medium text-zinc-100">
                    <button
                      onClick={() => onSelectClassroom(c)}
                      className="hover:underline text-sky-400 font-semibold text-sm text-left flex items-center gap-2"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-300">
                    {c.section || '—'} {c.subject ? `(${c.subject})` : ''}
                  </td>
                  <td className="py-3.5 px-4 text-zinc-300">{c.teacherName}</td>
                  <td className="py-3.5 px-4 text-zinc-300">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                      <Users className="w-3 h-3 text-zinc-400" />
                      {c.studentUids?.length || 0} students
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded">
                      <span className="font-bold text-zinc-200 tracking-wider">
                        {c.joinCode}
                      </span>
                      <button
                        onClick={() => handleCopyCode(c.joinCode)}
                        className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
                        title="Copy Join Code"
                      >
                        {copiedCode === c.joinCode ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    <button
                      onClick={() => onSelectClassroom(c)}
                      className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-medium inline-flex items-center gap-1"
                    >
                      Open Class
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {isTeacher && c.teacherId === userProfile.uid && (
                      <button
                        onClick={() => handleDeleteClass(c.id, c.name)}
                        className="p-1 text-zinc-500 hover:text-red-400 rounded inline-block transition-colors"
                        title="Delete Class"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Class Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200">
            <h2 className="text-base font-mono font-bold uppercase tracking-wide border-b border-zinc-800 pb-3 mb-4">
              Create New Classroom
            </h2>
            <form onSubmit={handleCreateClass} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Class Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics 101"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Section / Period
                </label>
                <input
                  type="text"
                  placeholder="e.g. Section A"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g. Calculus & Algebra"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold rounded"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Class Code Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200">
            <h2 className="text-base font-mono font-bold uppercase tracking-wide border-b border-zinc-800 pb-3 mb-4">
              Join Classroom by Code
            </h2>
            <form onSubmit={handleJoinClass} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  6-Character Join Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. PX92KA"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 uppercase tracking-widest text-center font-bold text-lg focus:outline-none focus:border-zinc-600"
                />
              </div>

              {joinError && (
                <div className="text-red-400 bg-red-950/60 border border-red-900 p-2.5 rounded text-xs">
                  {joinError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinError(null);
                  }}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold rounded"
                >
                  Join Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
