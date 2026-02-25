/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CreditCard, 
  BarChart3, 
  Search, 
  Phone, 
  School, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  UserPlus,
  LogOut,
  CalendarCheck,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Client ---
let supabaseClient: any = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  try {
    supabaseClient = createClient(url, key);
    return supabaseClient;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
};

const supabase = getSupabase();

// --- Types ---
interface Student {
  id: number;
  full_name: string;
  class_grade: string;
  school_name?: string;
  parent_phone: string;
  parent_name?: string;
  admission_date: string;
  batch_timing?: string;
  status: 'Active' | 'Left';
  leaving_date?: string;
  notes?: string;
  teacher_id: string;
}

interface AttendanceRecord {
  id: string;
  student_id: number;
  attendance_date: string;
  status: 'Present' | 'Absent' | 'Leave' | 'Holiday';
}

interface Fee {
  id: number;
  student_id: number;
  fee_month: string;
  amount: number;
  paid_date: string;
  payment_mode: 'Cash' | 'Online';
  payment_reference?: string;
}

interface DashboardData {
  activeCount: number;
  totalCollected: number;
  cashCollected: number;
  onlineCollected: number;
  paidCount: number;
  unpaidCount: number;
  leftThisMonth: number;
  unpaidStudents: Student[];
  paidFees: (Fee & { student: { full_name: string } })[];
  monthlyAttendance: AttendanceRecord[];
}

// --- Components ---
const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div className={`bg-white rounded-2xl border border-black/5 shadow-sm p-6 ${className}`} {...props}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'danger' | 'warning' }) => {
  const styles = {
    default: 'bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-rose-100 text-rose-700',
    warning: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'dashboard' | 'attendance' | 'students' | 'fees' | 'reports'>('dashboard');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportFilter, setReportFilter] = useState('');
  const [reportType, setReportType] = useState<'fees' | 'attendance'>('fees');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [studentFees, setStudentFees] = useState<Fee[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dbHealth, setDbHealth] = useState<{ students: boolean, profiles: boolean, profileExists: boolean }>({ students: true, profiles: true, profileExists: true });

  // --- Auth Logic ---
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setLoading(false);
      return;
    }

    // Test connection
    client.auth.getSession().then(({ data: { session }, error }: any) => {
      if (error) {
        setConnectionError(error.message);
      } else {
        setSession(session);
      }
      setLoading(false);
    }).catch((err: any) => {
      setConnectionError(err.message || "Unknown connection error");
      setLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Data Fetching & Realtime ---
  const fetchData = async () => {
    const client = getSupabase();
    if (!client || !session) return;

    // Health Check
    const { error: studentsError } = await client.from('students').select('id').limit(1);
    const { error: profilesError } = await client.from('profiles').select('id').limit(1);
    const { data: myProfile } = await client.from('profiles').select('id').eq('id', session.user.id).single();

    setDbHealth({
      students: !studentsError,
      profiles: !profilesError,
      profileExists: !!myProfile
    });

    // Fetch Students
    const { data: studentsData } = await client
      .from('students')
      .select('*')
      .order('full_name', { ascending: true });
    
    if (studentsData) setStudents(studentsData);

    // Fetch Attendance
    const { data: attData } = await client
      .from('attendance')
      .select('*')
      .eq('attendance_date', attendanceDate);
      
    if (attData) setAttendance(attData);

    // Fetch Dashboard/Fees for selected month
    const startOfMonth = `${selectedMonth}-01`;
    const endOfMonth = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).toISOString().split('T')[0];

    // 1. Active Students for this month
    const { data: activeStudents } = await client
      .from('students')
      .select('*')
      .lte('admission_date', endOfMonth)
      .or(`status.eq.Active,leaving_date.gte.${startOfMonth}`);

    // 2. Paid Fees for this month
    const { data: paidFees } = await client
      .from('fees')
      .select('*, student:students(full_name, class_grade, batch_timing)')
      .eq('fee_month', selectedMonth);

    // 3. Left this month
    const { data: leftStudents } = await client
      .from('students')
      .select('id')
      .eq('status', 'Left')
      .gte('leaving_date', startOfMonth)
      .lte('leaving_date', endOfMonth);

    // 4. Monthly Attendance
    const { data: monthlyAtt } = await client
      .from('attendance')
      .select('*')
      .gte('attendance_date', startOfMonth)
      .lte('attendance_date', endOfMonth);

    if (activeStudents && paidFees) {
      const totalCollected = paidFees.reduce((sum, f) => sum + f.amount, 0);
      const cashCollected = paidFees.filter(f => f.payment_mode === 'Cash').reduce((sum, f) => sum + f.amount, 0);
      const onlineCollected = paidFees.filter(f => f.payment_mode === 'Online').reduce((sum, f) => sum + f.amount, 0);

      const paidStudentIds = new Set(paidFees.map(f => f.student_id));
      const unpaidStudents = activeStudents.filter(s => !paidStudentIds.has(s.id));

      setDashboard({
        activeCount: activeStudents.length,
        totalCollected,
        cashCollected,
        onlineCollected,
        paidCount: paidFees.length,
        unpaidCount: unpaidStudents.length,
        leftThisMonth: leftStudents?.length || 0,
        unpaidStudents,
        paidFees: paidFees as any,
        monthlyAttendance: monthlyAtt || []
      });
    }
  };

  useEffect(() => {
    const client = getSupabase();
    if (client && session) {
      fetchData();

      // Realtime Subscriptions
      const studentsChannel = client.channel('students-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => fetchData())
        .subscribe();

      const feesChannel = client.channel('fees-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fees' }, () => fetchData())
        .subscribe();

      const attendanceChannel = client.channel('attendance-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchData())
        .subscribe();

      return () => {
        client.removeChannel(studentsChannel);
        client.removeChannel(feesChannel);
        client.removeChannel(attendanceChannel);
      };
    }
  }, [session, selectedMonth, attendanceDate]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.parent_phone.includes(searchTerm) ||
      s.class_grade.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [students, searchTerm]);

  const attendanceSummary = useMemo(() => {
    if (!dashboard?.monthlyAttendance) return [];
    
    const summary: Record<number, { present: number, absent: number, leave: number, holiday: number }> = {};
    
    dashboard.monthlyAttendance.forEach(record => {
      if (!summary[record.student_id]) {
        summary[record.student_id] = { present: 0, absent: 0, leave: 0, holiday: 0 };
      }
      if (record.status === 'Present') summary[record.student_id].present++;
      if (record.status === 'Absent') summary[record.student_id].absent++;
      if (record.status === 'Leave') summary[record.student_id].leave++;
      if (record.status === 'Holiday') summary[record.student_id].holiday++;
    });

    return students
      .filter(s => s.status === 'Active')
      .filter(s => !reportFilter || s.class_grade === reportFilter)
      .map(s => ({
        student: s,
        stats: summary[s.id] || { present: 0, absent: 0, leave: 0, holiday: 0 }
      }));
  }, [dashboard?.monthlyAttendance, students, reportFilter]);

  // --- Actions ---
  const markAttendance = async (studentId: number, status: string) => {
    const client = getSupabase();
    if (!client) return;

    const { error } = await client.from('attendance').upsert({
      student_id: studentId,
      attendance_date: attendanceDate,
      status,
      teacher_id: session.user.id
    }, { onConflict: 'student_id,attendance_date' });

    if (error) {
      console.error("Attendance error:", error);
      alert(`Failed to mark attendance: ${error.message}`);
    } else {
      fetchData();
    }
  };

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const client = getSupabase();
    if (!client) return;

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    const { error } = await client.from('students').insert([{
      full_name: data.full_name,
      class_grade: data.class_grade,
      school_name: data.school_name,
      parent_phone: data.parent_phone,
      admission_date: data.admission_date,
      batch_timing: data.batch_timing,
      teacher_id: session.user.id
    }]);

    if (error) {
      console.error("Admission error:", error);
      alert(`Failed to add student: ${error.message}`);
    } else {
      setShowAddStudent(false);
      fetchData();
    }
  };

  const handleRecordFee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const client = getSupabase();
    if (!client) return;

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    const { error } = await client.from('fees').insert([{
      student_id: selectedStudent?.id,
      fee_month: data.fee_month,
      amount: parseInt(data.amount as string),
      paid_date: data.paid_date,
      payment_mode: data.payment_mode,
      payment_reference: data.payment_reference,
      teacher_id: session.user.id
    }]);

    if (error) {
      console.error("Fee error:", error);
      alert(`Failed to record fee: ${error.message}`);
    } else {
      setShowFeeModal(false);
      fetchData();
    }
  };

  const markAsLeft = async (id: number) => {
    if (!confirm("Mark as Left?")) return;
    const client = getSupabase();
    if (!client) return;

    await client.from('students')
      .update({ status: 'Left', leaving_date: new Date().toISOString().split('T')[0] })
      .eq('id', id);
  };

  const viewStudentHistory = async (student: Student) => {
    setHistoryStudent(student);
    setStudentFees([]);
    setLoadingHistory(true);
    const client = getSupabase();
    if (client) {
      const { data } = await client
        .from('fees')
        .select('*')
        .eq('student_id', student.id)
        .order('fee_month', { ascending: false });
      if (data) setStudentFees(data);
    }
    setLoadingHistory(false);
  };

  const exportCSV = () => {
    if (reportType === 'fees') {
      if (!dashboard?.paidFees) return;
      const headers = ['Student Name', 'Amount', 'Date', 'Mode', 'Reference'];
      const rows = dashboard.paidFees
        .filter(f => !reportFilter || f.student?.class_grade === reportFilter)
        .map(f => [
          f.student?.full_name || 'Unknown',
          f.amount,
          f.paid_date,
          f.payment_mode,
          f.payment_reference || ''
        ]);
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `fees_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = ['Student Name', 'Class', 'Present', 'Absent', 'Leave', 'Holiday'];
      const rows = attendanceSummary.map(row => [
        row.student.full_name,
        row.student.class_grade,
        row.stats.present,
        row.stats.absent,
        row.stats.leave,
        row.stats.holiday
      ]);
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `attendance_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const copyReminder = (s: Student) => {
    const msg = `Reminder: Monthly fee for ${s.full_name} for ${selectedMonth} is pending. Please pay at your earliest convenience. - Rajeev Classes`;
    navigator.clipboard.writeText(msg);
    alert("Reminder copied to clipboard!");
  };

  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const client = getSupabase();
    if (!client) {
      alert("Supabase is not configured. Please check your environment variables.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    if (isSignUp) {
      const { error } = await client.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert("Check your email for a confirmation link (if enabled) or try signing in!");
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-zinc-400">Loading Rajeev Classes...</div>;

  if (!session) {
    const client = getSupabase();
    const isConfigured = !!client && !connectionError;

    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
              <School size={28} />
            </div>
            <h1 className="text-2xl font-black tracking-tight">Rajeev Classes</h1>
          </div>

          {!isConfigured ? (
            <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl text-center">
              <AlertCircle className="mx-auto text-rose-500 mb-2" size={32} />
              <h3 className="font-bold text-rose-900 mb-1">Connection Error</h3>
              <p className="text-sm text-rose-700 mb-4">
                {connectionError || "Supabase configuration is missing or invalid."}
              </p>
              <div className="text-left space-y-2">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Environment Check</p>
                <div className="text-xs text-rose-600 font-mono bg-white/50 p-3 rounded-xl border border-rose-100 break-all">
                  <p><strong>URL:</strong> {import.meta.env.VITE_SUPABASE_URL ? "✅ Set" : "❌ Missing"}</p>
                  <p className="mt-1"><strong>Key:</strong> {import.meta.env.VITE_SUPABASE_ANON_KEY ? (import.meta.env.VITE_SUPABASE_ANON_KEY.startsWith('sb_') ? "⚠️ Stripe Key Detected" : "✅ Set") : "❌ Missing"}</p>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-rose-400 italic">
                Note: Supabase keys must be JWTs starting with 'eyJ'.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-6 w-full bg-rose-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-rose-700 transition-all"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="flex bg-zinc-100 p-1 rounded-xl mb-4">
                <button 
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isSignUp ? 'bg-white shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                >
                  Sign In
                </button>
                <button 
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isSignUp ? 'bg-white shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                >
                  Sign Up
                </button>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Email</label>
                <input name="email" type="email" required className="w-full px-4 py-3 bg-zinc-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="teacher@rajeev.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Password</label>
                <input name="password" type="password" required className="w-full px-4 py-3 bg-zinc-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>
          )}
          
          {isConfigured && (
            <p className="mt-6 text-center text-xs text-zinc-400">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"} 
              <button onClick={() => setIsSignUp(!isSignUp)} className="ml-1 text-indigo-600 font-bold hover:underline">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans pb-24 md:pb-0 md:pl-64">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-black/5 p-6 z-40">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <School size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Rajeev Classes</h1>
        </div>
        <nav className="space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
            { id: 'students', label: 'Students', icon: Users },
            { id: 'fees', label: 'Fees', icon: CreditCard },
            { id: 'reports', label: 'Reports', icon: Download },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                view === item.id ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-zinc-500 hover:bg-zinc-50'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4 bg-zinc-50 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Teacher</p>
            <p className="font-semibold text-xs truncate w-32">{session.user.email}</p>
          </div>
          <button onClick={() => getSupabase()?.auth.signOut()} className="text-zinc-400 hover:text-rose-600">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold capitalize">{view}</h2>
            <p className="text-zinc-500 text-sm">Real-time student & fee management.</p>
          </div>
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-black/5 rounded-xl px-4 py-2 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </header>

        <AnimatePresence mode="wait">
          {view === 'attendance' && (
            <motion.div key="att" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex gap-4 items-center w-full sm:w-auto">
                  <input 
                    type="date" 
                    value={attendanceDate} 
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="bg-white border border-black/5 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select 
                    className="bg-white border border-black/5 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    onChange={(e) => setSearchTerm(e.target.value)}
                    value={searchTerm}
                  >
                    <option value="">All Classes</option>
                    {[...new Set(students.map(s => s.class_grade))].sort().map(c => (
                      <option key={c} value={c}>Grade {c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={async () => {
                      const client = getSupabase();
                      if (!client) return;
                      const active = filteredStudents.filter(s => s.status === 'Active');
                      const upserts = active.map(s => ({
                        student_id: s.id,
                        attendance_date: attendanceDate,
                        status: 'Present',
                        teacher_id: session.user.id
                      }));
                      await client.from('attendance').upsert(upserts, { onConflict: 'student_id,attendance_date' });
                      fetchData();
                    }}
                    className="flex-1 sm:flex-none bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-600 transition-colors"
                  >
                    <CheckCircle2 size={20} /> Mark All Present
                  </button>
                  <button 
                    onClick={async () => {
                      const client = getSupabase();
                      if (!client) return;
                      const active = filteredStudents.filter(s => s.status === 'Active');
                      const upserts = active.map(s => ({
                        student_id: s.id,
                        attendance_date: attendanceDate,
                        status: 'Holiday',
                        teacher_id: session.user.id
                      }));
                      await client.from('attendance').upsert(upserts, { onConflict: 'student_id,attendance_date' });
                      fetchData();
                    }}
                    className="flex-1 sm:flex-none bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-600 transition-colors"
                  >
                    Mark All Holiday
                  </button>
                </div>
              </div>

              <Card className="!p-0 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 border-b border-black/5">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Class & Batch</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredStudents.filter(s => s.status === 'Active').length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-zinc-400">
                          <CalendarCheck className="mx-auto mb-3 opacity-20" size={48} />
                          <p className="font-medium">No active students found</p>
                        </td>
                      </tr>
                    ) : filteredStudents.filter(s => s.status === 'Active').map(s => {
                      const record = attendance.find(a => a.student_id === s.id);
                      return (
                        <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(s.full_name)}
                            </div>
                            <span className="font-bold">{s.full_name}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-500">Grade {s.class_grade} • {s.batch_timing || 'No Batch'}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex gap-2 justify-end">
                              {['Present', 'Absent', 'Leave', 'Holiday'].map(status => (
                                <button
                                  key={status}
                                  onClick={() => markAttendance(s.id, status)}
                                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    record?.status === status 
                                      ? status === 'Present' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' 
                                      : status === 'Absent' ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                                      : status === 'Leave' ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                      : 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                                    : 'bg-white text-zinc-500 border-black/10 hover:bg-zinc-50'
                                  }`}
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {(!dbHealth.students || !dbHealth.profiles || !dbHealth.profileExists) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="text-amber-500 shrink-0" size={20} />
                  <div className="text-sm">
                    <p className="font-bold text-amber-900">Database Setup Incomplete</p>
                    <p className="text-amber-700 mb-2">Some tables are missing or your profile is not created. Please run the SQL script in your Supabase Editor.</p>
                    <div className="flex gap-4 text-xs font-mono items-center">
                      <span className={dbHealth.students ? 'text-emerald-600' : 'text-rose-600'}>Students: {dbHealth.students ? 'OK' : 'Missing'}</span>
                      <span className={dbHealth.profiles ? 'text-emerald-600' : 'text-rose-600'}>Profiles: {dbHealth.profiles ? 'OK' : 'Missing'}</span>
                      <span className={dbHealth.profileExists ? 'text-emerald-600' : 'text-rose-600'}>Your Profile: {dbHealth.profileExists ? 'OK' : 'Missing'}</span>
                      {!dbHealth.profileExists && dbHealth.profiles && (
                        <button 
                          onClick={async () => {
                            const client = getSupabase();
                            if (client) {
                              await client.from('profiles').insert([{ id: session.user.id, full_name: session.user.email.split('@')[0] }]);
                              fetchData();
                            }
                          }}
                          className="ml-auto px-3 py-1 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-all"
                        >
                          Fix Profile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Active Students</p>
                  <h3 className="text-3xl font-black">{dashboard?.activeCount || 0}</h3>
                </Card>
                <Card>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Collected</p>
                  <h3 className="text-3xl font-black text-emerald-600">₹{dashboard?.totalCollected.toLocaleString() || 0}</h3>
                </Card>
                <Card>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Pending</p>
                  <h3 className="text-3xl font-black text-amber-600">{dashboard?.unpaidCount || 0}</h3>
                </Card>
                <Card>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Left This Month</p>
                  <h3 className="text-3xl font-black text-rose-600">{dashboard?.leftThisMonth || 0}</h3>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="h-[400px] flex flex-col">
                  <h3 className="font-bold mb-4">Unpaid Students</h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {dashboard?.unpaidStudents.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-black/5 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                            {getInitials(s.full_name)}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{s.full_name}</p>
                            <p className="text-xs text-zinc-500">Grade {s.class_grade} • {s.batch_timing || 'No Batch'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => copyReminder(s)}
                            className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Copy Reminder"
                          >
                            <Phone size={14} />
                          </button>
                          <button 
                            onClick={() => { setSelectedStudent(s); setShowFeeModal(true); }}
                            className="px-3 py-1.5 bg-white border border-black/5 rounded-lg text-xs font-bold hover:bg-indigo-50"
                          >
                            Record
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="h-[400px] flex flex-col">
                  <h3 className="font-bold mb-6">Collection Summary</h3>
                  <div className="flex-1 flex flex-col justify-center space-y-8">
                    <div className="text-center mb-2">
                      <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-2">Total Revenue</p>
                      <p className="text-5xl font-black text-zinc-900">₹{dashboard?.totalCollected.toLocaleString() || 0}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500"></div> Cash
                        </span>
                        <div className="text-right">
                          <span className="font-bold">₹{dashboard?.cashCollected.toLocaleString()}</span>
                          <span className="text-zinc-400 ml-2 text-xs">
                            ({dashboard?.totalCollected ? Math.round((dashboard.cashCollected / dashboard.totalCollected) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(dashboard?.cashCollected || 0) / (dashboard?.totalCollected || 1) * 100}%` }}></div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-indigo-500"></div> Online
                        </span>
                        <div className="text-right">
                          <span className="font-bold">₹{dashboard?.onlineCollected.toLocaleString()}</span>
                          <span className="text-zinc-400 ml-2 text-xs">
                            ({dashboard?.totalCollected ? Math.round((dashboard.onlineCollected / dashboard.totalCollected) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(dashboard?.onlineCollected || 0) / (dashboard?.totalCollected || 1) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {view === 'students' && (
            <motion.div key="stu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" placeholder="Search students..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                <button onClick={() => setShowAddStudent(true)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700">
                  <UserPlus size={20} /> Add Student
                </button>
              </div>
              <Card className="!p-0 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 border-b border-black/5">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Contact & School</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Class & Batch</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                          <Users className="mx-auto mb-3 opacity-20" size={48} />
                          <p className="font-medium">No students found</p>
                        </td>
                      </tr>
                    ) : filteredStudents.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors group">
                        <td className="px-6 py-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                            {getInitials(s.full_name)}
                          </div>
                          <div>
                            <p className="font-bold">{s.full_name}</p>
                            <p className="text-xs text-zinc-400">Joined {s.admission_date}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">{s.parent_phone}</p>
                          <p className="text-xs text-zinc-400 truncate max-w-[150px]">{s.school_name || 'No School'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">Grade {s.class_grade}</p>
                          <p className="text-xs text-zinc-400">{s.batch_timing || 'No Batch'}</p>
                        </td>
                        <td className="px-6 py-4"><Badge variant={s.status === 'Active' ? 'success' : 'danger'}>{s.status}</Badge></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => viewStudentHistory(s)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Payment History">
                              <History size={18} />
                            </button>
                            <button onClick={() => markAsLeft(s.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" title="Mark as Left">
                              <XCircle size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}

          {view === 'fees' && (
            <motion.div key="fees" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" placeholder="Search active students..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>
              <Card className="!p-0 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 border-b border-black/5">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Student</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Class & Batch</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Fee Status ({selectedMonth})</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredStudents.filter(s => s.status === 'Active').length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-zinc-400">
                          <CreditCard className="mx-auto mb-3 opacity-20" size={48} />
                          <p className="font-medium">No active students found</p>
                        </td>
                      </tr>
                    ) : filteredStudents.filter(s => s.status === 'Active').map(s => {
                      const isPaid = dashboard?.paidFees.find(f => f.student_id === s.id);
                      return (
                        <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                              {getInitials(s.full_name)}
                            </div>
                            <div>
                              <p className="font-bold">{s.full_name}</p>
                              <p className="text-xs text-zinc-400">{s.parent_phone}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium">Grade {s.class_grade}</p>
                            <p className="text-xs text-zinc-400">{s.batch_timing || 'No Batch'}</p>
                          </td>
                          <td className="px-6 py-4">
                            {isPaid ? (
                              <Badge variant="success">Paid ₹{isPaid.amount}</Badge>
                            ) : (
                              <Badge variant="danger">Unpaid</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isPaid ? (
                              <button 
                                onClick={() => { setSelectedStudent(s); setShowFeeModal(true); }}
                                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                              >
                                Record Fee
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-400 font-medium">Paid on {isPaid.paid_date}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}

          {view === 'reports' && (
            <motion.div key="rep" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex bg-white border border-black/5 rounded-xl p-1 shadow-sm w-full sm:w-auto">
                  <button 
                    onClick={() => setReportType('fees')}
                    className={`flex-1 px-6 py-2 rounded-lg text-sm font-bold transition-all ${reportType === 'fees' ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-500 hover:bg-zinc-50'}`}
                  >
                    Fee Report
                  </button>
                  <button 
                    onClick={() => setReportType('attendance')}
                    className={`flex-1 px-6 py-2 rounded-lg text-sm font-bold transition-all ${reportType === 'attendance' ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-500 hover:bg-zinc-50'}`}
                  >
                    Attendance Report
                  </button>
                </div>
                <div className="flex gap-4 w-full sm:w-auto">
                  <select 
                    className="bg-white border border-black/5 rounded-xl px-4 py-2 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 flex-1 sm:flex-none"
                    onChange={(e) => setReportFilter(e.target.value)}
                    value={reportFilter}
                  >
                    <option value="">All Classes</option>
                    {[...new Set(students.map(s => s.class_grade))].sort().map(c => (
                      <option key={c} value={c}>Grade {c}</option>
                    ))}
                  </select>
                  <button 
                    onClick={exportCSV}
                    className="bg-white border border-black/5 text-zinc-700 px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-zinc-50 flex-1 sm:flex-none"
                  >
                    <Download size={20} /> Export
                  </button>
                </div>
              </div>
              <Card className="!p-0 overflow-hidden">
                {reportType === 'fees' ? (
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-black/5">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Class</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Amount</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Date</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {(!dashboard?.paidFees || dashboard.paidFees.length === 0) ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                            <CreditCard className="mx-auto mb-3 opacity-20" size={48} />
                            <p className="font-medium">No fees recorded for this month</p>
                          </td>
                        </tr>
                      ) : dashboard.paidFees
                        .filter(f => !reportFilter || f.student?.class_grade === reportFilter)
                        .map(f => (
                        <tr key={f.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(f.student?.full_name || 'U')}
                            </div>
                            <span className="font-bold">{f.student?.full_name || 'Unknown'}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-500">Grade {f.student?.class_grade || 'N/A'}</td>
                          <td className="px-6 py-4 font-bold text-emerald-600">₹{f.amount}</td>
                          <td className="px-6 py-4 text-sm text-zinc-500">{f.paid_date}</td>
                          <td className="px-6 py-4"><Badge>{f.payment_mode}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-black/5">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Class</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-center">Present</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-center">Absent</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-center">Leave</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase text-center">Holiday</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {attendanceSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                            <CalendarCheck className="mx-auto mb-3 opacity-20" size={48} />
                            <p className="font-medium">No students found</p>
                          </td>
                        </tr>
                      ) : attendanceSummary.map(row => (
                        <tr key={row.student.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(row.student.full_name)}
                            </div>
                            <span className="font-bold">{row.student.full_name}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-500">Grade {row.student.class_grade}</td>
                          <td className="px-6 py-4 text-center font-bold text-emerald-600">{row.stats.present}</td>
                          <td className="px-6 py-4 text-center font-bold text-rose-600">{row.stats.absent}</td>
                          <td className="px-6 py-4 text-center font-bold text-amber-600">{row.stats.leave}</td>
                          <td className="px-6 py-4 text-center font-bold text-zinc-500">{row.stats.holiday}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAddStudent && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6">
              <h3 className="text-xl font-bold mb-6">New Admission</h3>
              <form onSubmit={handleAddStudent} className="space-y-4">
                <input name="full_name" required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="Student Full Name" />
                <input name="school_name" className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="School Name (Optional)" />
                <div className="grid grid-cols-2 gap-4">
                  <input name="class_grade" required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="Class (e.g. 10)" />
                  <input name="batch_timing" className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="Batch (e.g. 4 PM)" />
                </div>
                <input name="parent_phone" required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="Parent Phone" />
                <input name="admission_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" />
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowAddStudent(false)} className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-50">Cancel</button>
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700">Save</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showFeeModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 bg-indigo-600 text-white">
                <h3 className="text-xl font-bold">Record Payment</h3>
                <p className="text-indigo-100">{selectedStudent.full_name}</p>
              </div>
              <form onSubmit={handleRecordFee} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input name="fee_month" type="month" defaultValue={selectedMonth} required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" />
                  <input name="amount" type="number" placeholder="Amount" required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" />
                  <input name="paid_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" />
                  <select name="payment_mode" className="w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none">
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                  <input name="payment_reference" className="col-span-2 w-full px-4 py-2.5 bg-zinc-50 border border-black/5 rounded-xl outline-none" placeholder="Reference (Optional)" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowFeeModal(false)} className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-50">Cancel</button>
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700">Confirm</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {historyStudent && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">Payment History</h3>
                  <p className="text-indigo-100">{historyStudent.full_name}</p>
                </div>
                <button onClick={() => setHistoryStudent(null)} className="text-white/70 hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                {loadingHistory ? (
                  <p className="text-center text-zinc-500 py-8">Loading history...</p>
                ) : studentFees.length === 0 ? (
                  <p className="text-center text-zinc-500 py-8">No payment history found.</p>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-black/5">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase">Month</th>
                        <th className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase">Amount</th>
                        <th className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase">Date Paid</th>
                        <th className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase">Mode</th>
                        <th className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {studentFees.map(f => (
                        <tr key={f.id} className="hover:bg-zinc-50/50">
                          <td className="px-4 py-3 font-medium">{f.fee_month}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600">₹{f.amount}</td>
                          <td className="px-4 py-3 text-sm text-zinc-500">{f.paid_date}</td>
                          <td className="px-4 py-3"><Badge>{f.payment_mode}</Badge></td>
                          <td className="px-4 py-3 text-sm text-zinc-500">{f.payment_reference || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
