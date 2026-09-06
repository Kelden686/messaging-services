import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { Mail, Lock, User as UserIcon, ShieldAlert, KeyRound, Image as ImageIcon } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'otp';

export const AuthPage: React.FC = () => {
  const { login, register, verifyOtp, error: authError, isLoading } = useAuthStore();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoMessage(null);

    try {
      if (mode === 'login') {
        if (!email || !password) {
          setLocalError('All fields are required');
          return;
        }
        await login({ email, password });
      } else if (mode === 'register') {
        if (!email || !password || !name) {
          setLocalError('Name, email, and password are required');
          return;
        }
        const result = await register({ email, password, name, avatar });
        alert('Register request succeeded! Switching to verification view.');
        setInfoMessage(result.message || 'OTP verification code printed to server console.');
        setMode('otp');
      } else if (mode === 'otp') {
        if (otpCode.length !== 6) {
          setLocalError('OTP must be exactly 6 digits');
          return;
        }
        await verifyOtp({ email, code: otpCode });
      }
    } catch (err: any) {
      alert(`Submission Error: ${err.message || err}`);
      setLocalError(err.message || 'An error occurred');
    }
  };

  const currentError = localError || authError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-radial from-slate-100 to-slate-200 dark:from-slate-900 dark:to-black p-4 relative overflow-hidden transition-colors duration-300">
      {/* Decorative Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white/70 dark:bg-zinc-900/75 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl rounded-3xl p-8 overflow-hidden z-10"
      >
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-brand-green/10 text-brand-green rounded-2xl mb-3">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.011 2.29c-5.358 0-9.702 4.343-9.702 9.7 0 2.05.635 3.96 1.725 5.54L2.39 22l4.896-1.282c1.517.827 3.25 1.298 5.093 1.298 5.358 0 9.702-4.343 9.702-9.7 0-5.36-4.343-9.7-9.7-9.701zm0 17.766c-1.848 0-3.578-.495-5.075-1.36l-.364-.216-3.032.795.808-2.95-.236-.377a8.03 8.03 0 01-1.233-4.22c0-4.437 3.611-8.048 8.048-8.048 4.436 0 8.047 3.612 8.047 8.05-.004 4.435-3.612 8.046-8.058 8.046z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'register' && 'Create Account'}
            {mode === 'otp' && 'Verify Email'}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {mode === 'login' && 'Log in to connect with your contacts'}
            {mode === 'register' && 'Get started with a free messaging account'}
            {mode === 'otp' && `Enter the 6-digit OTP sent to ${email}`}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {currentError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-xl flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{currentError}</span>
            </motion.div>
          )}

          {infoMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 bg-brand-green/10 border border-brand-green/20 text-brand-green dark:text-emerald-400 text-sm rounded-xl flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>{infoMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.div
                key="login-fields"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {mode === 'register' && (
              <motion.div
                key="register-fields"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Display Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Avatar Image URL (Optional)
                  </label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="url"
                      placeholder="https://example.com/avatar.jpg"
                      value={avatar}
                      onChange={(e) => setAvatar(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 outline-none rounded-xl text-zinc-900 dark:text-white text-sm transition-all duration-200"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {mode === 'otp' && (
              <motion.div
                key="otp-fields"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1 text-center">
                  Verification Code (Check server console log)
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-green/50 tracking-[0.25em] text-center font-mono outline-none rounded-xl text-zinc-900 dark:text-white text-lg transition-all duration-200"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm transition-all duration-200 shadow-md shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'login' && 'Log In'}
                {mode === 'register' && 'Sign Up'}
                {mode === 'otp' && 'Verify & Enter'}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          {mode === 'otp' ? (
            <button
              onClick={() => {
                setMode('register');
                setOtpCode('');
                setLocalError(null);
                setInfoMessage(null);
              }}
              className="text-brand-green dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              Back to Sign Up
            </button>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                className="text-brand-green dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
              >
                {mode === 'login' ? 'Sign Up' : 'Log In'}
              </button>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};
