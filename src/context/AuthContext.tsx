import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { logAuditEvent } from '../lib/audit';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  signUpWithEmail: (
    email: string,
    pass: string,
    displayName: string,
    role: UserRole,
    studentId?: string
  ) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: (requestedRole?: UserRole, studentId?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  quickDemoLogin: (role: 'teacher' | 'student') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Theme state defaulting to 'dark'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('classtrack_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('classtrack_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        return userSnap.data() as UserProfile;
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      const saved = localStorage.getItem('classtrack_saved_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as UserProfile;
          if (parsed.uid === uid) return parsed;
        } catch (_) {}
      }
    }
    return null;
  };

  // Check if any approved teachers exist in system
  const checkIfFirstTeacher = async (): Promise<boolean> => {
    try {
      if (!auth.currentUser) return true;
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where('approved', '==', true)
      );
      const snap = await getDocs(q);
      return snap.empty;
    } catch (err) {
      console.error('Error checking teacher approval count:', err);
      return true; // Gracefully allow first user to be approved if check fails
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.uid);
      if (p) {
        saveAndSetUserProfile(p);
      }
    }
  };

  const saveAndSetUserProfile = (profile: UserProfile) => {
    localStorage.setItem('classtrack_saved_user', JSON.stringify(profile));
    setUserProfile(profile);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        let p = await fetchProfile(firebaseUser.uid);
        if (!p) {
          // If profile doc missing, bootstrap default
          const isAdminUser = firebaseUser.email?.toLowerCase() === 'brynmonzon@gmail.com';
          const defaultProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            role: isAdminUser ? 'teacher' : 'student',
            approved: true,
            createdAt: new Date().toISOString(),
          };
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid), defaultProfile, { merge: true });
            p = defaultProfile;
          } catch (e) {
            console.error('Error auto-creating profile doc:', e);
            p = defaultProfile;
          }
        }
        if (p) {
          saveAndSetUserProfile(p);
        }
      } else {
        localStorage.removeItem('classtrack_saved_user');
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUpWithEmail = async (
    email: string,
    pass: string,
    displayName: string,
    role: UserRole,
    studentId?: string
  ) => {
    setLoading(true);
    let uid = '';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
    } catch (err: any) {
      setLoading(false);
      throw err;
    }

    try {
      let approved = true;
      const isAdminEmail = email.toLowerCase() === 'brynmonzon@gmail.com';

      if (role === 'teacher') {
        if (isAdminEmail) {
          approved = true;
        } else {
          const isFirst = await checkIfFirstTeacher();
          approved = isFirst;
        }
      }

      const newProfile: UserProfile = {
        uid,
        email,
        displayName: displayName || (role === 'teacher' ? 'Teacher' : 'Student'),
        role,
        approved,
        studentId: role === 'student' ? studentId : undefined,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', uid), newProfile, { merge: true });
      saveAndSetUserProfile(newProfile);

      await logAuditEvent(
        uid,
        newProfile.displayName,
        role,
        'LOGIN',
        `User signed up via email as ${role}. Approval status: ${approved}`
      );
    } catch (err) {
      setLoading(false);
      throw err;
    }
    setLoading(false);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    let uid = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
    } catch (err: any) {
      setLoading(false);
      throw err;
    }

    try {
      let profile = await fetchProfile(uid);
      if (!profile) {
        // Fallback create profile if missing
        const isAdminEmail = email.toLowerCase() === 'brynmonzon@gmail.com';
        profile = {
          uid,
          email,
          displayName: email.split('@')[0] || 'User',
          role: isAdminEmail ? 'teacher' : 'student',
          approved: true,
          createdAt: new Date().toISOString(),
        };
        try {
          await setDoc(doc(db, 'users', uid), profile, { merge: true });
        } catch (_) {}
      }

      saveAndSetUserProfile(profile);

      await logAuditEvent(
        uid,
        profile.displayName,
        profile.role,
        'LOGIN',
        `User logged in via email.`
      );
    } catch (err) {
      setLoading(false);
      throw err;
    }
    setLoading(false);
  };

  const signInWithGoogle = async (requestedRole: UserRole = 'student', studentId?: string) => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      let existing = await fetchProfile(res.user.uid);

      if (!existing) {
        const isAdminEmail = res.user.email?.toLowerCase() === 'brynmonzon@gmail.com';
        let approved = true;
        if (requestedRole === 'teacher') {
          if (isAdminEmail) {
            approved = true;
          } else {
            const isFirst = await checkIfFirstTeacher();
            approved = isFirst;
          }
        }

        const newProfile: UserProfile = {
          uid: res.user.uid,
          email: res.user.email || '',
          displayName: res.user.displayName || 'User',
          role: isAdminEmail ? 'teacher' : requestedRole,
          approved,
          studentId: requestedRole === 'student' ? studentId : undefined,
          createdAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'users', res.user.uid), newProfile, { merge: true });
        saveAndSetUserProfile(newProfile);

        await logAuditEvent(
          res.user.uid,
          newProfile.displayName,
          newProfile.role,
          'LOGIN',
          `User created account via Google as ${newProfile.role}. Approval status: ${approved}`
        );
      } else {
        saveAndSetUserProfile(existing);
        await logAuditEvent(
          res.user.uid,
          existing.displayName,
          existing.role,
          'LOGIN',
          `User logged in via Google.`
        );
      }
    } catch (err: any) {
      setLoading(false);
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error(
          'Google Sign-In is unavailable on this preview domain (auth/unauthorized-domain). Please use Email & Password to log in or register.'
        );
      }
      throw err;
    }
    setLoading(false);
  };

  const logout = async () => {
    const activeUid = userProfile?.uid || user?.uid;
    if (userProfile && activeUid) {
      await logAuditEvent(
        activeUid,
        userProfile.displayName,
        userProfile.role,
        'LOGOUT',
        `User logged out.`
      );
    }
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('Firebase signout skipped:', err);
    }
    localStorage.removeItem('classtrack_saved_user');
    setUser(null);
    setUserProfile(null);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    const activeUid = userProfile?.uid || user?.uid;
    if (!activeUid || !userProfile) return;
    const ref = doc(db, 'users', activeUid);
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await updateDoc(ref, updated);
    const newProfile = { ...userProfile, ...updated };
    saveAndSetUserProfile(newProfile);
  };

  const quickDemoLogin = async (targetRole: 'teacher' | 'student') => {
    setLoading(true);
    const email =
      targetRole === 'teacher' ? 'demo.teacher@classtrack.edu' : 'demo.student@classtrack.edu';
    const pass = 'classtrack123';
    const displayName = targetRole === 'teacher' ? 'Prof. Sarah Jenkins' : 'Alex Rivera';
    const studentId = targetRole === 'student' ? 'STU-2024-882' : undefined;

    let uid = targetRole === 'teacher' ? 'demo_teacher_uid_99' : 'demo_student_uid_88';

    // 1. Try Firebase Authentication
    try {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
      } catch (loginErr: any) {
        if (
          loginErr.code === 'auth/user-not-found' ||
          loginErr.code === 'auth/invalid-credential' ||
          loginErr.code === 'auth/invalid-login-credentials'
        ) {
          try {
            const createCred = await createUserWithEmailAndPassword(auth, email, pass);
            uid = createCred.user.uid;
          } catch (createErr: any) {
            console.warn('Fallback: Auth user creation skipped/failed:', createErr);
          }
        }
      }
    } catch (authErr) {
      console.warn('Firebase Auth step encountered error, proceeding with resilient demo profile:', authErr);
    }

    // 2. Build and set complete profile
    const profile: UserProfile = {
      uid,
      email,
      displayName,
      role: targetRole,
      approved: true,
      studentId,
      bio:
        targetRole === 'teacher'
          ? 'Senior Lecturer in Computer Science & Distributed Systems.'
          : 'Second-year undergraduate student in Software Engineering.',
      officeHours:
        targetRole === 'teacher' ? 'Mon & Wed 2:00 PM - 4:30 PM (Room 402)' : undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      // Sync to Firestore if permitted
      await setDoc(doc(db, 'users', uid), profile, { merge: true });
    } catch (e) {
      console.warn('Firestore profile write skipped:', e);
    }

    // Set local state immediately so UI unlocks
    saveAndSetUserProfile(profile);

    // 3. Seed initial sample classroom if teacher
    if (targetRole === 'teacher') {
      try {
        const classSnap = await getDocs(
          query(collection(db, 'classes'), where('teacherId', '==', uid))
        );
        if (classSnap.empty) {
          const classRef = await addDoc(collection(db, 'classes'), {
            name: 'CS 101: Introduction to Computer Science',
            section: 'Section A - Fall 2026',
            subject: 'Computer Science',
            teacherId: uid,
            teacherName: displayName,
            joinCode: 'CS101A',
            studentUids: ['demo_student_uid_88', 'demo_student_01', 'demo_student_02'],
            studentsMap: {
              demo_student_uid_88: {
                uid: 'demo_student_uid_88',
                studentId: 'STU-2024-882',
                displayName: 'Alex Rivera',
                email: 'demo.student@classtrack.edu',
                joinedAt: new Date().toISOString(),
              },
              demo_student_01: {
                uid: 'demo_student_01',
                studentId: 'STU-2024-001',
                displayName: 'Emma Watson',
                email: 'emma.watson@school.edu',
                joinedAt: new Date().toISOString(),
              },
              demo_student_02: {
                uid: 'demo_student_02',
                studentId: 'STU-2024-002',
                displayName: 'Liam Miller',
                email: 'liam.miller@school.edu',
                joinedAt: new Date().toISOString(),
              },
            },
            createdAt: new Date().toISOString(),
          });

          // Seed announcement
          await addDoc(collection(db, 'announcements'), {
            classId: classRef.id,
            authorUid: uid,
            authorId: uid,
            authorName: displayName,
            authorRole: 'teacher',
            title: 'Welcome to CS 101!',
            content:
              'Welcome to the course! Please review the syllabus and lab schedule in the assignments tab.',
            priority: 'high',
            targetAudience: 'all',
            pinned: true,
            commentCount: 0,
            createdAt: new Date().toISOString(),
          });

          // Seed assignment
          await addDoc(collection(db, 'assignments'), {
            classId: classRef.id,
            teacherId: uid,
            title: 'Lab 1: Algorithm Analysis & Big-O Notation',
            description: 'Implement core search algorithms and submit runtime benchmarks.',
            dueDate: new Date(Date.now() + 6 * 86400000).toISOString(),
            totalPoints: 100,
            allowLateSubmissions: true,
            latePenaltyPercentPerDay: 5,
            submissionsCount: 2,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (seedErr) {
        console.warn('Sample class seeding skipped:', seedErr);
      }
    }

    // 4. Enroll student if student role
    if (targetRole === 'student') {
      try {
        const allClasses = await getDocs(collection(db, 'classes'));
        if (!allClasses.empty) {
          for (const cDoc of allClasses.docs) {
            const cData = cDoc.data();
            if (!cData.studentUids?.includes(uid)) {
              const newUids = [...(cData.studentUids || []), uid];
              const newMap = {
                ...(cData.studentsMap || {}),
                [uid]: {
                  uid,
                  studentId: studentId || 'STU-2024-882',
                  displayName,
                  email,
                  joinedAt: new Date().toISOString(),
                },
              };
              await updateDoc(doc(db, 'classes', cDoc.id), {
                studentUids: newUids,
                studentsMap: newMap,
              });
              break;
            }
          }
        }
      } catch (enrollErr) {
        console.warn('Student auto-enrollment skipped:', enrollErr);
      }
    }

    try {
      await logAuditEvent(
        uid,
        displayName,
        targetRole,
        'LOGIN',
        `User logged in via 1-click demo as ${targetRole}`
      );
    } catch (_) {}

    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        theme,
        toggleTheme,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        logout,
        refreshProfile,
        updateProfileData,
        quickDemoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
