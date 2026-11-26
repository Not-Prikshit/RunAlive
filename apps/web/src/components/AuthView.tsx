import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { ThemeToggle } from './ThemeToggle';
import { RunAliveLogo } from './RunAliveLogo';
import { AnimatedGameBackground } from './AnimatedGameBackground';
import {
  Compass,
  ArrowRight,
  Lock,
  Mail,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  Loader2,
  Shield,
  Crosshair,
  Zap,
  MapPin,
  Flame,
} from 'lucide-react';

export const AuthView: React.FC = React.memo(() => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Status & Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuthStore();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!emailOrUsername.trim()) {
      setError('Please provide your email or username');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      await login(emailOrUsername.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!username.trim() || username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, username.trim());
    } catch (err: any) {
      setError(err.message || 'Registration failed. An account with this email may already exist.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSuccessMsg('Reset instructions sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Unable to process recovery request.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string = 'demo@runalive.test') => {
    setLoading(true);
    setError(null);
    try {
      await login(demoEmail, 'RunAlive2026!');
    } catch (err: any) {
      setError(err.message || 'Quick login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-[#FBBC04] selection:text-[#18181B] relative">
      <AnimatedGameBackground />
      {/* Header with Google-inspired Colorful Comic Accents */}
      <header className="border-b-[2.5px] border-[#18181B] dark:border-[#475569] bg-white dark:bg-[#1E293B] px-4 sm:px-8 py-3.5 shadow-[0_3px_0px_#18181B] dark:shadow-[0_3px_0px_#020617] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <RunAliveLogo size="lg" />
          </div>

          <div className="flex items-center space-x-3">
            {/* Google Dots decoration */}
            <div className="hidden sm:flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-[#4285F4] border border-[#18181B]" />
              <span className="w-3 h-3 rounded-full bg-[#EA4335] border border-[#18181B]" />
              <span className="w-3 h-3 rounded-full bg-[#FBBC04] border border-[#18181B]" />
              <span className="w-3 h-3 rounded-full bg-[#34A853] border border-[#18181B]" />
            </div>

            {/* Theme Toggle Button */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Authentication Arena */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 flex items-center justify-center relative z-10">
        <div className="grid lg:grid-cols-12 gap-8 w-full items-center">
          {/* Left Column: Comic Illustration & Adventure Storyboard (Desktop Only) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col space-y-6">
            <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-7 relative paper-tape shadow-[5px_5px_0px_#18181B] dark:shadow-[5px_5px_0px_#020617]">
              <div className="inline-block comic-stamp bg-[#FEF7E0] dark:bg-[#78350F] text-[#B45309] dark:text-[#FDE68A] border-[#18181B] dark:border-[#475569] text-xs mb-3 transform -rotate-1">
                ✦ MULTIPLAYER ADVENTURE JOURNAL
              </div>

              <h1 className="text-3xl sm:text-4xl font-heading font-black text-[#18181B] dark:text-white leading-tight">
                Turn Your Real Campus Into A{' '}
                <span className="marker-highlight-yellow text-[#0F172A] dark:text-[#0F172A]">Comic Tag Battlefield!</span>
              </h1>

              {/* Speech Bubble */}
              <div className="speech-bubble p-4 mt-5 bg-[#F8FAFC] dark:bg-[#0F172A]">
                <p className="text-xs sm:text-sm font-sans font-medium text-[#18181B] dark:text-[#F8FAFC] leading-relaxed">
                  "No tiny virtual joysticks here! RunAlive turns your actual outdoors, college grounds, or local park into an active multiplayer survival match with real GPS tracking."
                </p>
                <div className="text-[11px] font-mono font-bold text-[#4285F4] dark:text-[#93C5FD] mt-2">
                  — OPERATOR BRIEFING #01
                </div>
              </div>

              {/* Comic Feature Grid */}
              <div className="grid sm:grid-cols-2 gap-3 mt-6">
                <div className="p-3 bg-[#E8F0FE] border-2 border-[#18181B] rounded-xl shadow-[2.5px_2.5px_0px_#18181B]">
                  <div className="flex items-center space-x-2 text-[#4285F4] font-heading font-bold text-xs uppercase">
                    <Shield className="w-4 h-4" />
                    <span>Hiders (Run & Evade)</span>
                  </div>
                  <p className="text-[11px] text-[#475569] mt-1">
                    Stay inside shrinking zones and outmaneuver seekers.
                  </p>
                </div>

                <div className="p-3 bg-[#FCE8E6] border-2 border-[#18181B] rounded-xl shadow-[2.5px_2.5px_0px_#18181B]">
                  <div className="flex items-center space-x-2 text-[#EA4335] font-heading font-bold text-xs uppercase">
                    <Crosshair className="w-4 h-4" />
                    <span>Seekers (Track & Tag)</span>
                  </div>
                  <p className="text-[11px] text-[#475569] mt-1">
                    Close the distance and verify catches within 10 meters!
                  </p>
                </div>

                <div className="p-3 bg-[#FEF7E0] border-2 border-[#18181B] rounded-xl shadow-[2.5px_2.5px_0px_#18181B]">
                  <div className="flex items-center space-x-2 text-[#B45309] font-heading font-bold text-xs uppercase">
                    <Flame className="w-4 h-4 text-[#FBBC04]" />
                    <span>Shrinking Play Zones</span>
                  </div>
                  <p className="text-[11px] text-[#475569] mt-1">
                    Battle royale-style danger zones force thrilling showdowns.
                  </p>
                </div>

                <div className="p-3 bg-[#E6F4EA] border-2 border-[#18181B] rounded-xl shadow-[2.5px_2.5px_0px_#18181B]">
                  <div className="flex items-center space-x-2 text-[#34A853] font-heading font-bold text-xs uppercase">
                    <MapPin className="w-4 h-4" />
                    <span>Modern Satellite & Streets</span>
                  </div>
                  <p className="text-[11px] text-[#475569] mt-1">
                    100% free high-resolution street cartography with zero external API keys!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Comic Form Cutout Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto relative z-10">
            <div className="comic-card bg-white dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] p-6 sm:p-8 shadow-[6px_6px_0px_#18181B] dark:shadow-[6px_6px_0px_#020617] relative z-10">
              {/* Top Instant 1-Click Demo Button */}
              <button
                type="button"
                onClick={() => handleQuickLogin()}
                disabled={loading}
                className="w-full mb-5 py-3 px-4 comic-btn-yellow text-xs sm:text-sm font-heading font-black flex items-center justify-center space-x-2 transform hover:-translate-y-0.5 active:translate-y-0.5"
              >
                <Sparkles className="w-4 h-4 text-[#18181B]" />
                <span>⚡ 1-CLICK INSTANT DEMO LOGIN & MAP ACCESS</span>
              </button>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 p-1 bg-[#F1ECE4] dark:bg-[#0F172A] border-2 border-[#18181B] dark:border-[#475569] rounded-xl mb-6 shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617]">
                <button
                  type="button"
                  onClick={() => {
                    setMode('LOGIN');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 text-xs font-heading font-bold rounded-lg transition ${
                    mode === 'LOGIN'
                      ? 'bg-white dark:bg-[#1E293B] text-[#18181B] dark:text-white border-2 border-[#18181B] dark:border-[#475569] shadow-[2px_2px_0px_#18181B] dark:shadow-[2px_2px_0px_#020617]'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white'
                  }`}
                >
                  SIGN IN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('REGISTER');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 text-xs font-heading font-bold rounded-lg transition ${
                    mode === 'REGISTER'
                      ? 'bg-white dark:bg-[#1E293B] text-[#18181B] dark:text-white border-2 border-[#18181B] dark:border-[#475569] shadow-[2px_2px_0px_#18181B] dark:shadow-[2px_2px_0px_#020617]'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white'
                  }`}
                >
                  CREATE ACCOUNT
                </button>
              </div>

              {/* Feedback Notifications */}
              {error && (
                <div className="mb-4 p-3 bg-[#FCE8E6] border-2 border-[#EA4335] rounded-xl text-xs text-[#EA4335] font-medium flex items-start space-x-2 shadow-[2px_2px_0px_#EA4335]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 bg-[#E6F4EA] border-2 border-[#34A853] rounded-xl text-xs text-[#1E8E3E] font-medium flex items-start space-x-2 shadow-[2px_2px_0px_#34A853]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Mode 1: LOGIN FORM */}
              {mode === 'LOGIN' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Email or Username
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={emailOrUsername}
                        onChange={(e) => setEmailOrUsername(e.target.value)}
                        placeholder="e.g. demo@runalive.test"
                        className="w-full bg-[#F1F5F9] text-[#0F172A] text-sm px-3.5 py-2.5 pl-10 rounded-xl border-2 border-[#0F172A] focus:bg-white focus:shadow-[3px_3px_0px_#2563EB] outline-none transition"
                      />
                      <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-heading font-bold text-[#18181B] uppercase">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('FORGOT');
                          setError(null);
                        }}
                        className="text-xs font-mono text-[#4285F4] hover:underline"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#F1F5F9] text-[#0F172A] text-sm px-3.5 py-2.5 pl-10 rounded-xl border-2 border-[#0F172A] focus:bg-white focus:shadow-[3px_3px_0px_#2563EB] outline-none transition"
                      />
                      <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 accent-[#4285F4] cursor-pointer"
                    />
                    <label htmlFor="rememberMe" className="text-xs font-medium text-[#475569] cursor-pointer">
                      Remember me on this phone / browser
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 comic-btn-primary flex items-center justify-center space-x-2 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>ENTERING RUNALIVE...</span>
                      </>
                    ) : (
                      <>
                        <span>SIGN IN TO ADVENTURE</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* 1-Click Demo Accounts Quick Select */}
                  <div className="pt-3 border-t-2 border-dashed border-[#CBD5E1]">
                    <div className="text-[11px] font-heading font-bold text-[#64748B] uppercase mb-1.5 flex justify-between">
                      <span>Quick Demo Roles:</span>
                      <span className="text-[#4285F4] font-mono">Password: RunAlive2026!</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickLogin('demo@runalive.test')}
                        className="py-1.5 px-2 bg-[#E8F0FE] hover:bg-[#D2E3FC] border-2 border-[#18181B] rounded-lg text-[10px] font-heading font-bold text-[#4285F4] text-center shadow-[1.5px_1.5px_0px_#18181B] active:translate-y-0.5"
                      >
                        Host Alex
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickLogin('runner@runalive.test')}
                        className="py-1.5 px-2 bg-[#FEF7E0] hover:bg-[#FEEFC3] border-2 border-[#18181B] rounded-lg text-[10px] font-heading font-bold text-[#B45309] text-center shadow-[1.5px_1.5px_0px_#18181B] active:translate-y-0.5"
                      >
                        Runner Sam
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickLogin('seeker@runalive.test')}
                        className="py-1.5 px-2 bg-[#FCE8E6] hover:bg-[#FAD2CF] border-2 border-[#18181B] rounded-lg text-[10px] font-heading font-bold text-[#EA4335] text-center shadow-[1.5px_1.5px_0px_#18181B] active:translate-y-0.5"
                      >
                        Seeker Riley
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Mode 2: REGISTER FORM */}
              {mode === 'REGISTER' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Username / Call-Sign
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. SwiftFox"
                        className="w-full bg-[#FAF8F5] text-[#18181B] text-sm px-3.5 py-2 pl-10 rounded-xl border-2 border-[#18181B] focus:bg-white focus:shadow-[3px_3px_0px_#34A853] outline-none"
                      />
                      <User className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@runalive.app"
                        className="w-full bg-[#FAF8F5] text-[#18181B] text-sm px-3.5 py-2 pl-10 rounded-xl border-2 border-[#18181B] focus:bg-white focus:shadow-[3px_3px_0px_#34A853] outline-none"
                      />
                      <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Password (min 8 characters)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#FAF8F5] text-[#18181B] text-sm px-3.5 py-2 pl-10 rounded-xl border-2 border-[#18181B] focus:bg-white focus:shadow-[3px_3px_0px_#34A853] outline-none"
                      />
                      <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#FAF8F5] text-[#18181B] text-sm px-3.5 py-2 pl-10 rounded-xl border-2 border-[#18181B] focus:bg-white focus:shadow-[3px_3px_0px_#34A853] outline-none"
                      />
                      <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 comic-btn-green flex items-center justify-center space-x-2 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>CREATING PLAYER ACCOUNT...</span>
                      </>
                    ) : (
                      <>
                        <span>REGISTER OPERATOR</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Mode 3: FORGOT PASSWORD */}
              {mode === 'FORGOT' && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Enter your registered email address and we will generate a recovery token to reset your password.
                  </p>

                  <div>
                    <label className="block text-xs font-heading font-bold text-[#18181B] uppercase mb-1">
                      Account Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@runalive.app"
                        className="w-full bg-[#FAF8F5] text-[#18181B] text-sm px-3.5 py-2.5 pl-10 rounded-xl border-2 border-[#18181B] focus:bg-white focus:shadow-[3px_3px_0px_#FBBC04] outline-none"
                      />
                      <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 comic-btn-yellow flex items-center justify-center space-x-2 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#18181B]" />
                        <span>SENDING RECOVERY...</span>
                      </>
                    ) : (
                      <>
                        <span>SEND RESET LINK</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('LOGIN')}
                    className="w-full text-center text-xs font-heading font-bold text-[#4285F4] hover:underline"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Comic Footer */}
      <footer className="border-t-[2.5px] border-[#18181B] dark:border-[#475569] bg-white dark:bg-[#1E293B] px-6 py-3 text-center text-xs font-mono text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center justify-between relative z-10">
        <div>RUNALIVE // OUTDOOR GPS MULTIPLAYER TAG</div>
        <div className="text-[11px] font-bold text-[#4285F4] dark:text-[#93C5FD]">
          GOOGLE PLAYFUL PALETTE • COMIC SKETCHBOOK ENGINE
        </div>
      </footer>
    </div>
  );
});

AuthView.displayName = 'AuthView';
export default AuthView;
