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

type TuriwaContextValue = {
  circles: Circle[];
  contributions: Contribution[];
  addContribution: (amount: number, note: string) => Promise<void>;
  createCircle: (name: string, monthly: number) => Promise<void>;
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

const CIRCLES_KEY = '@turiwa/circles';
const CONTRIBUTIONS_KEY = '@turiwa/contributions';
const TuriwaContext = createContext<TuriwaContextValue | null>(null);

export function TuriwaProvider({ children }: { children: React.ReactNode }) {
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const [contributions, setContributions] = useState<Contribution[]>(initialContributions);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(CIRCLES_KEY), AsyncStorage.getItem(CONTRIBUTIONS_KEY)]).then(([storedCircles, storedContributions]) => {
      if (!active) return;
      if (storedCircles) setCircles(JSON.parse(storedCircles) as Circle[]);
      if (storedContributions) setContributions(JSON.parse(storedContributions) as Contribution[]);
      setHydrated(true);
    }).catch(() => setHydrated(true));
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

  const value = useMemo(() => ({ circles, contributions, addContribution, createCircle, hydrated }), [circles, contributions, hydrated]);
  return <TuriwaContext.Provider value={value}>{children}</TuriwaContext.Provider>;
}

export function useTuriwa() {
  const value = useContext(TuriwaContext);
  if (!value) throw new Error('useTuriwa must be used inside TuriwaProvider');
  return value;
}