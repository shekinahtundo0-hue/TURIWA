import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Contribution = {
  id: string;
  circleId: string;
  amount: number;
  date: string;
  note: string;
  status: 'Complete' | 'Pending';
};

export type Circle = {
  id: string;
  name: string;
  members: number;
  target: number;
  monthly: number;
  color: 'green' | 'gold' | 'blue';
};

export type Loan = {
  id: string;
  principal: number;
  balance: number;
  monthlyRepayment: number;
  interestRate: number;
  dueDate: string;
  purpose: string;
  status: 'Active' | 'Pending' | 'Paid off';
};

type TuriwaContextValue = {
  circles: Circle[];
  contributions: Contribution[];
  loans: Loan[];
  authHydrated: boolean;
  signedIn: boolean;
  profileName: string;
  addContribution: (amount: number, note: string) => Promise<void>;
  createCircle: (name: string, monthly: number) => Promise<void>;
  applyForLoan: (amount: number, purpose: string) => Promise<void>;
  repayLoan: (amount: number) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  createAccount: (name: string, phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hydrated: boolean;
};

const initialCircles: Circle[] = [
  { id: 'harambee', name: 'Harambee Queens', members: 12, target: 240000, monthly: 2000, color: 'green' },
  { id: 'estate', name: 'Greenview Estate', members: 8, target: 160000, monthly: 1500, color: 'gold' },
];

const initialContributions: Contribution[] = [
  { id: '1', circleId: 'harambee', amount: 2000, date: 'Today, 08:42', note: 'Monthly contribution', status: 'Complete' },
  { id: '2', circleId: 'estate', amount: 1500, date: '28 Aug 2026', note: 'Monthly contribution', status: 'Complete' },
  { id: '3', circleId: 'harambee', amount: 2000, date: '28 Jul 2026', note: 'Monthly contribution', status: 'Complete' },
];

const initialLoans: Loan[] = [
  {
    id: 'loan-1',
    principal: 30000,
    balance: 16800,
    monthlyRepayment: 4000,
    interestRate: 5,
    dueDate: '30 Sep 2026',
    purpose: 'School fees',
    status: 'Active',
  },
];

const CIRCLES_KEY = '@turiwa/circles';
const CONTRIBUTIONS_KEY = '@turiwa/contributions';
const LOANS_KEY = '@turiwa/loans';
const AUTH_KEY = '@turiwa/auth';
const TuriwaContext = createContext<TuriwaContextValue | null>(null);

export function TuriwaProvider({ children }: { children: React.ReactNode }) {
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const [contributions, setContributions] = useState<Contribution[]>(initialContributions);
  const [loans, setLoans] = useState<Loan[]>(initialLoans);
  const [hydrated, setHydrated] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profileName, setProfileName] = useState('Sheila');

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(CIRCLES_KEY),
      AsyncStorage.getItem(CONTRIBUTIONS_KEY),
      AsyncStorage.getItem(LOANS_KEY),
      AsyncStorage.getItem(AUTH_KEY),
    ]).then(([storedCircles, storedContributions, storedLoans, storedAuth]) => {
      if (!active) return;
      if (storedCircles) setCircles(JSON.parse(storedCircles) as Circle[]);
      if (storedContributions) setContributions(JSON.parse(storedContributions) as Contribution[]);
      if (storedLoans) setLoans(JSON.parse(storedLoans) as Loan[]);
      if (storedAuth) {
        const auth = JSON.parse(storedAuth) as { signedIn?: boolean; name?: string };
        setSignedIn(Boolean(auth.signedIn));
        if (auth.name) setProfileName(auth.name);
      }
      setHydrated(true);
      setAuthHydrated(true);
    }).catch(() => {
      setHydrated(true);
      setAuthHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const addContribution = async (amount: number, note: string) => {
    const next: Contribution[] = [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      circleId: 'harambee',
      amount,
      date: 'Just now',
      note: note.trim() || 'Contribution',
      status: 'Complete',
    }, ...contributions];
    setContributions(next);
    await AsyncStorage.setItem(CONTRIBUTIONS_KEY, JSON.stringify(next));
  };

  const createCircle = async (name: string, monthly: number) => {
    const next: Circle[] = [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      members: 1,
      target: monthly * 12,
      monthly,
      color: 'blue',
    }, ...circles];
    setCircles(next);
    await AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(next));
  };

  const applyForLoan = async (amount: number, purpose: string) => {
    const next: Loan[] = [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      principal: amount,
      balance: amount,
      monthlyRepayment: Math.ceil((amount * 1.05) / 6),
      interestRate: 5,
      dueDate: '30 Oct 2026',
      purpose: purpose.trim() || 'Personal need',
      status: 'Pending',
    }, ...loans];
    setLoans(next);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(next));
  };

  const repayLoan = async (amount: number) => {
    const activeLoan = loans.find((loan) => loan.status === 'Active' || loan.status === 'Pending');
    if (!activeLoan) return;
    const next = loans.map((loan) => {
      if (loan.id !== activeLoan.id) return loan;
      const balance = Math.max(loan.balance - amount, 0);
      return { ...loan, balance, status: balance === 0 ? 'Paid off' as const : 'Active' as const };
    });
    setLoans(next);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(next));
  };

  const signIn = async (_phone: string, _password: string) => {
    const next = { signedIn: true, name: profileName || 'Sheila' };
    setSignedIn(true);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
  };

  const createAccount = async (name: string, _phone: string, _password: string) => {
    const next = { signedIn: true, name: name.trim() || 'Sheila' };
    setProfileName(next.name);
    setSignedIn(true);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
  };

  const signOut = async () => {
    setSignedIn(false);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ signedIn: false, name: profileName }));
  };

  const value = useMemo(
    () => ({
      circles,
      contributions,
      loans,
      authHydrated,
      signedIn,
      profileName,
      addContribution,
      createCircle,
      applyForLoan,
      repayLoan,
      signIn,
      createAccount,
      signOut,
      hydrated,
    }),
    [circles, contributions, loans, authHydrated, signedIn, profileName, hydrated],
  );
  return <TuriwaContext.Provider value={value}>{children}</TuriwaContext.Provider>;
}

export function useTuriwa() {
  const value = useContext(TuriwaContext);
  if (!value) throw new Error('useTuriwa must be used inside TuriwaProvider');
  return value;
}