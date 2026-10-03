import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Firestore rejects `undefined` field values, so drop them before saving.
const clean = <T extends object>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a sign-up (or first Google sign-in) is creating the profile.
  // Firebase signs the person in the instant the Auth account exists, BEFORE the
  // profile is saved. Without this flag the auth listener below would see "no
  // profile yet" and create a default approved *student*, overwriting a teacher.
  const registeringRef = useRef(false);

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
      if (firebaseUser && registeringRef.current) {
        // The sign-up / Google flow is creating the profile itself.
        return;
      }
      if (firebaseUser) {
        let p = await fetchProfile(firebaseUser.uid);
        if (!p) {
          // If profile doc missing, bootstrap default
          const defaultProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            role: 'student',
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

  // Keep the profile in sync in real time. If an admin approves or revokes this
  // user while they are signed in, the app reacts immediately.
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) saveAndSetUserProfile(snap.data() as UserProfile);
      },
      (err) => console.warn('Profile listener error:', err)
    );
    return () => unsub();
  }, [user?.uid]);

  const signUpWithEmail = async (
    email: string,
    pass: string,
    displayName: string,
    role: UserRole,
    studentId?: string
  ) => {
    if (role === 'admin') {
      throw new Error('Administrator accounts cannot be registered here.');
    }
    registeringRef.current = true;
    setLoading(true);
    let cred: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;
    try {
      cred = await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      registeringRef.current = false;
      setLoading(false);
      throw err;
    }
    const uid = cred.user.uid;

    try {
      // Students are active immediately. Teachers always start unapproved and
      // must be approved by an administrator.
      const approved = role !== 'teacher';

      const newProfile: UserProfile = clean({
        uid,
        email,
        displayName: displayName || (role === 'teacher' ? 'Teacher' : 'Student'),
        role,
        approved,
        studentId: role === 'student' ? studentId : undefined,
        createdAt: new Date().toISOString(),
      });

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
      // Roll back so the person can simply try again, instead of being left with
      // a login that has no (or the wrong) profile.
      try {
        await cred.user.delete();
      } catch (_) {
        try { await firebaseSignOut(auth); } catch (__) {}
      }
      setUser(null);
      setUserProfile(null);
      registeringRef.current = false;
      setLoading(false);
      throw err;
    }
    registeringRef.current = false;
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
        profile = {
          uid,
          email,
          displayName: email.split('@')[0] || 'User',
          role: 'student',
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
    registeringRef.current = true;
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      let existing = await fetchProfile(res.user.uid);

      if (!existing) {
        const role: UserRole = requestedRole === 'teacher' ? 'teacher' : 'student';
        // Teachers always start unapproved; an administrator approves them.
        const approved = role !== 'teacher';

        const newProfile: UserProfile = clean({
          uid: res.user.uid,
          email: res.user.email || '',
          displayName: res.user.displayName || 'User',
          role,
          approved,
          studentId: role === 'student' ? studentId : undefined,
          createdAt: new Date().toISOString(),
        });

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
      registeringRef.current = false;
      setLoading(false);
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error(
          'Google Sign-In is unavailable on this preview domain (auth/unauthorized-domain). Please use Email & Password to log in or register.'
        );
      }
      throw err;
    }
    registeringRef.current = false;
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
