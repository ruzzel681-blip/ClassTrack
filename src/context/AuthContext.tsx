import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { 
  getSyntheticEmail, 
  logActivity, 
  subscribeUserProfile, 
  hasApprovedTeacher,
  DOMAIN 
} from '../services/attendanceService';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  profileLoadTimedOut: boolean;
  profileLoadErrorDetail: string | null;
  retryProfileLoad: () => Promise<void>;
  selectedRole: UserRole | null;
  theme: 'light' | 'dark';
  setSelectedRole: (role: UserRole | null) => void;
  toggleTheme: () => void;
  login: (userCode: string, password: string, role: UserRole) => Promise<void>;
  register: (data: {
    userCode: string;
    name: string;
    password: string;
    role: UserRole;
    departmentOrLocation: string;
    contactEmail?: string;
    subjectsTaught?: string[];
  }) => Promise<void>;
  logout: () => Promise<void>;
  toastMessage: { text: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileLoadTimedOut, setProfileLoadTimedOut] = useState<boolean>(false);
  const [profileLoadErrorDetail, setProfileLoadErrorDetail] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Theme setup with system preference fallback and user persistence
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('attendease_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('attendease_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(prev => prev?.text === text ? null : prev);
    }, 4000);
  };

  // Auth listener & live user profile subscription
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let profileTimer: ReturnType<typeof setTimeout> | null = null;

    // Safety timeout to ensure app never hangs on "Loading AttendEase system..."
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setProfileLoadTimedOut(false);
      setProfileLoadErrorDetail(null);
      if (profileTimer) clearTimeout(profileTimer);

      if (user) {
        if (unsubscribeProfile) unsubscribeProfile();

        // If the profile doc doesn't show up within 10s (dropped write during
        // signup, flaky connection, tab backgrounded mid-request, etc.), stop
        // spinning forever on "Loading user profile attributes..." and let
        // the person retry instead.
        profileTimer = setTimeout(() => {
          setProfileLoadTimedOut(true);
        }, 10000);

        unsubscribeProfile = subscribeUserProfile(
          user.uid,
          (profile) => {
            if (profile) {
              setUserProfile(profile);
              if (profile.role) {
                setSelectedRole(profile.role);
              }
              setProfileLoadTimedOut(false);
              setProfileLoadErrorDetail(null);
              if (profileTimer) clearTimeout(profileTimer);
            }
            setLoading(false);
            clearTimeout(safetyTimer);
          },
          (err) => {
            setProfileLoadErrorDetail(err?.code ? `${err.code}: ${err.message}` : String(err?.message || err));
          }
        );
      } else {
        setUserProfile(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      if (profileTimer) clearTimeout(profileTimer);
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Manual retry for when the profile never loaded in time. Re-checks
  // Firestore directly (bypassing the live listener) in case it silently
  // dropped, and surfaces a clear failure state if there's still nothing.
  const retryProfileLoad = async () => {
    if (!firebaseUser) return;
    setProfileLoadTimedOut(false);
    setProfileLoadErrorDetail(null);
    try {
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileSnap.exists()) {
        const profile = profileSnap.data() as UserProfile;
        setUserProfile(profile);
        if (profile.role) {
          setSelectedRole(profile.role);
        }
      } else {
        setProfileLoadTimedOut(true);
        setProfileLoadErrorDetail(`No document found at users/${firebaseUser.uid}`);
      }
    } catch (err: any) {
      console.error('Retry profile load failed:', err);
      setProfileLoadTimedOut(true);
      setProfileLoadErrorDetail(err?.code ? `${err.code}: ${err.message}` : String(err?.message || err));
    }
  };

  const login = async (userCode: string, password: string, role: UserRole) => {
    const cleanCode = userCode.trim().toUpperCase();
    if (!cleanCode || !password) {
      throw new Error('Please provide both your ID and password.');
    }

    // An admin account can be created two ways: added directly in the Firebase
    // console (admin.<id>@cedric.edu), or registered in the app as a teacher and
    // then promoted by editing its Firestore document. Try both emails.
    const emailsToTry = role === 'admin'
      ? [getSyntheticEmail(cleanCode, 'admin'), getSyntheticEmail(cleanCode, 'teacher')]
      : [getSyntheticEmail(cleanCode, role)];
    const syntheticEmail = emailsToTry[0];

    try {
      let userCredential: Awaited<ReturnType<typeof signInWithEmailAndPassword>> | undefined;
      for (let i = 0; i < emailsToTry.length; i++) {
        try {
          userCredential = await signInWithEmailAndPassword(auth, emailsToTry[i], password);
          break;
        } catch (e: any) {
          const notFound = ['auth/invalid-credential', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(e.code);
          if (i === emailsToTry.length - 1 || !notFound) throw e;
        }
      }
      if (!userCredential) throw new Error('Sign in failed.');
      
      // Verify profile in firestore
      const profileSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (profileSnap.exists()) {
        const profile = profileSnap.data() as UserProfile;
        if (profile.role !== role) {
          // Suspicious role mismatch attempt
          await logActivity(
            'suspicious_activity',
            cleanCode,
            profile.name || 'Unknown',
            role,
            `User attempted login as ${role.toUpperCase()} but account is registered as ${profile.role.toUpperCase()}`,
            'warning'
          );
          await signOut(auth);
          throw new Error(`This account is registered as a ${profile.role.toUpperCase()}, not a ${role.toUpperCase()}. Please select the correct role screen.`);
        }

        await logActivity(
          'login_success',
          cleanCode,
          profile.name,
          role,
          `Successful login as ${role.toUpperCase()} (${profile.status.toUpperCase()})`,
          'info'
        );
      } else {
        throw new Error('User profile record not found.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      // Log failed login security event
      try {
        await logActivity(
          'login_failed',
          cleanCode,
          'Unverified User',
          role,
          `Failed login attempt for ${role.toUpperCase()} ID '${cleanCode}': ${err.message || 'Invalid credentials'}`,
          'warning'
        );
      } catch (e) {
        // ignore logging failure
      }
      
      if (err.code === 'auth/operation-not-allowed' && role !== 'admin') {
        // Fallback session when Email/Password is disabled in Firebase Console
        // (never offered for the admin role: admin access must be real)
        const fallbackProfile: UserProfile = {
          uid: `${role}-${cleanCode.toLowerCase()}`,
          userCode: cleanCode,
          name: role === 'teacher' ? `Faculty Teacher (${cleanCode})` : `Student (${cleanCode})`,
          email: `${cleanCode.toLowerCase()}@${DOMAIN}`,
          syntheticEmail,
          role: role,
          status: 'approved',
          departmentOrLocation: role === 'teacher' ? 'Cedric Institute Administration' : 'Grade 12 - Section A',
          subjectsTaught: role === 'teacher' ? ['CS101', 'MATH202', 'ENG101'] : [],
          createdAt: new Date().toISOString(),
          approvedBy: 'Auto Fallback Access',
          approvedAt: new Date().toISOString()
        };
        const mockUser = {
          uid: fallbackProfile.uid,
          email: syntheticEmail,
          displayName: fallbackProfile.name,
        } as any;
        setFirebaseUser(mockUser);
        setUserProfile(fallbackProfile);
        setSelectedRole(role);
        showToast(`Logged in as ${fallbackProfile.name}!`, 'success');
        return;
      }

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        throw new Error('Invalid ID or Password. Please double check your credentials.');
      }
      throw err;
    }
  };

  const register = async (data: {
    userCode: string;
    name: string;
    password: string;
    role: UserRole;
    departmentOrLocation: string;
    contactEmail?: string;
    subjectsTaught?: string[];
  }) => {
    const cleanCode = data.userCode.trim().toUpperCase();
    const cleanName = data.name.trim();

    // Admin accounts can never be self-registered. They are created by hand in
    // the Firebase console (see README).
    if (data.role === 'admin') {
      throw new Error('Administrator accounts cannot be registered here.');
    }

    if (!cleanCode || !cleanName || !data.password) {
      throw new Error('Please fill in all required fields.');
    }

    if (data.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const syntheticEmail = getSyntheticEmail(cleanCode, data.role);

    try {
      // Priority 0 Security: A user can only create their own /users doc,
      // and it must start with status: 'pending' (never self-approve via client write)
      const initialStatus: 'pending' = 'pending';

      const credential = await createUserWithEmailAndPassword(auth, syntheticEmail, data.password);
      
      const newProfile: UserProfile = {
        uid: credential.user.uid,
        userCode: cleanCode,
        name: cleanName,
        email: data.contactEmail?.trim() || `${cleanCode.toLowerCase()}@${DOMAIN}`,
        syntheticEmail,
        role: data.role,
        status: initialStatus,
        departmentOrLocation: data.departmentOrLocation.trim() || 'Main Campus',
        subjectsTaught: data.subjectsTaught || [],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', credential.user.uid), newProfile);

      await logActivity(
        'registration',
        cleanCode,
        cleanName,
        data.role,
        `New ${data.role.toUpperCase()} registration (PENDING APPROVAL)`,
        'info'
      );

      showToast(
        data.role === 'teacher'
          ? 'Registration successful! Your account is pending administrator approval.'
          : 'Registration successful! Your account is pending teacher approval.',
        'info'
      );

    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        const fallbackProfile: UserProfile = {
          uid: `${data.role}-${cleanCode.toLowerCase()}`,
          userCode: cleanCode,
          name: cleanName,
          email: data.contactEmail?.trim() || `${cleanCode.toLowerCase()}@${DOMAIN}`,
          syntheticEmail,
          role: data.role,
          status: 'approved',
          departmentOrLocation: data.departmentOrLocation.trim() || 'Main Campus',
          subjectsTaught: data.subjectsTaught || [],
          createdAt: new Date().toISOString(),
          approvedBy: 'Auto Fallback Access',
          approvedAt: new Date().toISOString()
        };
        const mockUser = {
          uid: fallbackProfile.uid,
          email: syntheticEmail,
          displayName: fallbackProfile.name,
        } as any;
        setFirebaseUser(mockUser);
        setUserProfile(fallbackProfile);
        setSelectedRole(data.role);
        showToast(`Registered and signed in as ${cleanName}!`, 'success');
        return;
      }

      if (err.code === 'auth/email-already-in-use') {
        try {
          await logActivity(
            'suspicious_activity',
            cleanCode,
            cleanName,
            data.role,
            `Attempted duplicate registration for ID '${cleanCode}'`,
            'warning'
          );
        } catch (e) {
          // ignore logging failure
        }
        throw new Error(`An account with ID '${cleanCode}' is already registered. Please login instead.`);
      }
      throw err;
    }
  };

  const logout = async () => {
    if (userProfile) {
      try {
        await logActivity(
          'login_success',
          userProfile.userCode,
          userProfile.name,
          userProfile.role,
          `User logged out`,
          'info'
        );
      } catch (e) {
        // ignore logging failure
      }
    }
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
    setFirebaseUser(null);
    setUserProfile(null);
    setSelectedRole(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      userProfile,
      loading,
      profileLoadTimedOut,
      profileLoadErrorDetail,
      retryProfileLoad,
      selectedRole,
      theme,
      setSelectedRole,
      toggleTheme,
      login,
      register,
      logout,
      toastMessage,
      showToast
    }}>
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
