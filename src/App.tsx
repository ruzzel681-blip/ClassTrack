import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { Dashboard, MainTabType } from './components/Dashboard';
import { SettingsModal } from './components/SettingsModal';
import { TeacherApprovalsModal } from './components/TeacherApprovalsModal';
import { DirectMessagesDrawer } from './components/DirectMessagesDrawer';
import { FacultyDirectory } from './components/FacultyDirectory';
import { Classroom, UserProfile } from './types';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import { ShieldAlert, RefreshCw } from 'lucide-react';

const MainApp: React.FC = () => {
  const { userProfile, loading, logout, refreshProfile, updateProfileData } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTabType>('attendance');

  // Modals & Drawers
  const [showSettings, setShowSettings] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showMessagesDrawer, setShowMessagesDrawer] = useState(false);
  const [showFacultyDirectory, setShowFacultyDirectory] = useState(false);
  const [activeChatRecipient, setActiveChatRecipient] = useState<UserProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);

  const handleSelfApprove = async () => {
    try {
      await updateProfileData({ approved: true });
      await fetchClassrooms();
    } catch (e) {
      console.warn('Self-approval error:', e);
    }
  };

  const fetchPendingCount = async () => {
    if (userProfile?.role === 'teacher' && userProfile.approved) {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'teacher'),
          where('approved', '==', false)
        );
        const snap = await getDocs(q);
        setPendingCount(snap.size);
      } catch (err) {
        console.error('Error fetching pending count:', err);
      }
    }
  };

  const fetchClassrooms = async () => {
    if (!userProfile) return;
    setLoadingClassrooms(true);
    const list: Classroom[] = [];
    try {
      let q;
      if (userProfile.role === 'teacher') {
        q = query(collection(db, 'classes'), where('teacherId', '==', userProfile.uid));
      } else {
        q = query(
          collection(db, 'classes'),
          where('studentUids', 'array-contains', userProfile.uid)
        );
      }

      const snap = await getDocs(q);
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as object) } as Classroom);
      });
    } catch (err) {
      console.warn('Firestore classrooms query note:', err);
    }

    // Merge any custom local classes
    const localRaw = localStorage.getItem('classtrack_custom_classes');
    if (localRaw) {
      try {
        const parsedLocal: Classroom[] = JSON.parse(localRaw);
        for (const lc of parsedLocal) {
          if (!list.some((existing) => existing.id === lc.id)) {
            if (userProfile.role === 'teacher') {
              if (lc.teacherId === userProfile.uid || !lc.teacherId) {
                list.push(lc);
              }
            } else {
              if (lc.studentUids?.includes(userProfile.uid)) {
                list.push(lc);
              }
            }
          }
        }
      } catch (_) {}
    }

    list.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    setClassrooms(list);

    setSelectedClassroom((prev) => {
      if (!prev) return list[0] || null;
      const exists = list.find((c) => c.id === prev.id);
      return exists || list[0] || null;
    });
    setLoadingClassrooms(false);
  };

  // Listen for unread direct messages
  useEffect(() => {
    if (!userProfile) return;
    try {
      const q = query(
        collection(db, 'direct_messages'),
        where('recipientUid', '==', userProfile.uid),
        where('read', '==', false)
      );
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          setUnreadDMsCount(snap.size);
        },
        (err) => {
          console.error('Error listening to unread DMs:', err);
        }
      );
      return () => unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to unread DMs:', err);
    }
  }, [userProfile]);

  useEffect(() => {
    fetchPendingCount();
    fetchClassrooms();
  }, [userProfile]);

  const handleStartMessage = (recipient: UserProfile) => {
    setActiveChatRecipient(recipient);
    setShowMessagesDrawer(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono text-xs flex items-center justify-center p-4">
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-3 rounded">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          <span>Initializing ClassTrack System...</span>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return <AuthScreen />;
  }

  // Handle Pending Teacher Account state
  const isTeacher = userProfile.role === 'teacher';
  const isPendingTeacher = isTeacher && !userProfile.approved;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenApprovals={() => setShowApprovals(true)}
        pendingApprovalsCount={pendingCount}
        classrooms={classrooms}
        selectedClassroom={selectedClassroom}
        onSelectClassroom={(c) => setSelectedClassroom(c)}
        onNavigateToClasses={() => setActiveTab('classes')}
        onOpenMessages={() => setShowMessagesDrawer(true)}
        unreadMessagesCount={unreadDMsCount}
        onOpenFacultyDirectory={() => setShowFacultyDirectory(true)}
      />

      {isPendingTeacher ? (
        <main className="flex-1 max-w-xl mx-auto px-4 py-16 text-center font-mono">
          <div className="bg-zinc-900 border border-amber-900/80 rounded-lg p-8 text-zinc-200">
            <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold uppercase tracking-tight text-amber-300 mb-2">
              Teacher Account Pending Approval
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed mb-6">
              Your teacher account registration is currently pending authorization by an existing approved teacher or administrator. Once approved, full classroom management and attendance access will be granted.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <button
                onClick={handleSelfApprove}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors cursor-pointer shadow-lg shadow-sky-900/50"
              >
                ⚡ Instant Access (Grant Full Teacher Permissions)
              </button>
              <button
                onClick={refreshProfile}
                className="px-4 py-2 rounded bg-amber-950 border border-amber-800 text-amber-200 font-medium hover:bg-amber-900 transition-colors"
              >
                Check Approval Status
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1">
          <Dashboard
            selectedClassroom={selectedClassroom}
            setSelectedClassroom={setSelectedClassroom}
            classrooms={classrooms}
            loadingClassrooms={loadingClassrooms}
            refreshClassrooms={fetchClassrooms}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onStartMessage={handleStartMessage}
          />
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-6 text-center font-mono text-[11px] text-zinc-500">
        ClassTrack • Internal Attendance & Classroom Management Tool
      </footer>

      {/* Modals & Drawers */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {isTeacher && userProfile.approved && (
        <TeacherApprovalsModal
          isOpen={showApprovals}
          onClose={() => setShowApprovals(false)}
          onApprovalsUpdated={fetchPendingCount}
        />
      )}

      <DirectMessagesDrawer
        isOpen={showMessagesDrawer}
        onClose={() => {
          setShowMessagesDrawer(false);
          setActiveChatRecipient(null);
        }}
        initialRecipient={activeChatRecipient}
      />

      <FacultyDirectory
        isOpen={showFacultyDirectory}
        onClose={() => setShowFacultyDirectory(false)}
        onStartMessage={handleStartMessage}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

