import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Member } from '@/lib/types';

import type { UserRole } from '@/lib/types';

type AuthContextType = {
  session: User | null;
  user: User | null;
  member: Member | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isTreasurer: boolean;
  isProgramCoordinator: boolean;
  isChoirAdmin: boolean;
  role: UserRole;
  hasPermission: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<User | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMember = async (userId: string) => {
    try {
      const memberRef = doc(db, 'members', userId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        return { id: memberSnap.id, ...memberSnap.data() } as Member;
      }
      return null;
    } catch (err) {
      console.error('Error in fetchMember:', err);
      return null;
    }
  };

  const refreshMember = async () => {
    if (user) {
      const memberData = await fetchMember(user.uid);
      setMember(memberData);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setSession(currentUser);
      setUser(currentUser);
      if (currentUser) {
        const memberData = await fetchMember(currentUser.uid);
        setMember(memberData);
      } else {
        setMember(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: fullName });
      
      // Create member document in Firestore
      await setDoc(doc(db, 'members', userCredential.user.uid), {
        user_id: userCredential.user.uid,
        full_name: fullName,
        email: email,
        role: 'member',
        is_admin: false,
        is_active: true,
        status: 'active',
        joined_on: new Date().toISOString(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setMember(null);
  };

  const isAdmin = member?.is_admin ?? member?.role === 'choir_admin' ?? member?.role === 'super_admin' ?? false;
  const isSuperAdmin = member?.role === 'super_admin' ?? false;
  const isTreasurer = member?.role === 'treasurer' ?? false;
  const isProgramCoordinator = member?.role === 'program_coordinator' ?? false;
  const isChoirAdmin = member?.role === 'choir_admin' ?? false;
  const role: UserRole = member?.role ?? 'member';

  const hasPermission = (permission: string) => {
    if (isSuperAdmin) return true;
    if (member?.additional_permissions?.includes(permission)) return true;
    // Add role-based permission checks as needed
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        member,
        loading,
        isAdmin,
        isSuperAdmin,
        isTreasurer,
        isProgramCoordinator,
        isChoirAdmin,
        role,
        hasPermission,
        signIn,
        signUp,
        signOut,
        refreshMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
