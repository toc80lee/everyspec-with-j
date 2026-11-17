import React from 'react';
import {
  AlertCircle,
  Clock,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class WorkspaceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-bold text-white">Workspace Security / Sync Notice</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.message || 'An unexpected workspace or permission error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    firebaseUser,
    authReady,
    profileLoading,
    userProfile,
    isAdmin,
    isApproved,
    loginWithGoogle,
    logoutGoogle,
    refreshProfile,
    authError,
  } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const renderLanguageToggle = () => (
    <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
          lang === 'en' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
        }`}
      >
        A
      </button>
      <button
        type="button"
        onClick={() => setLang('ko')}
        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
          lang === 'ko' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
        }`}
      >
        가
      </button>
    </div>
  );

  // 1. Auth or profile initialization loading state
  if (!authReady || (firebaseUser && profileLoading && !userProfile)) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-800 flex items-center justify-center overflow-hidden mb-4 shadow-lg">
          <img
            src="/assets/aistudio/image_144c0bc1.png"
            alt="EverySpec Logo"
            className="w-full h-full object-contain scale-125"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          <span>{t('Verifying authentication & project permissions...', '인증 및 프로젝트 권한을 확인하는 중...')}</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated -> Google Login Page
  if (!firebaseUser) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-5 right-5">{renderLanguageToggle()}</div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-7 space-y-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/assets/aistudio/image_144c0bc1.png"
                alt="EverySpec Logo"
                className="w-full h-full object-contain scale-125"
              />
            </div>
            <div>
              <div className="text-[11px] font-mono font-semibold text-blue-400 uppercase tracking-wider">
                SAP ABAP Spec Governance
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Every Spec with J</h1>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {t(
              'Sign in with your Google Workspace account to access approved SAP specifications, real-time GUI simulation, and project-scoped workspaces.',
              'Google 계정으로 로그인하여 승인된 SAP 프로그램 사양서, 실시간 GUI 시뮬레이터 및 프로젝트별 협업 공간에 접속하세요.'
            )}
          </p>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2 text-[11px] text-slate-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t('Strict project-level & personal TEMP isolation', '프로젝트별 격리 및 개인 임시(TEMP) 공간 보안 적용')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{t('New users require administrator approval before workspace access', '최초 로그인 후 관리자 승인 완료 시 워크스페이스 이용 가능')}</span>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="min-w-0 break-words leading-relaxed">{authError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void loginWithGoogle()}
            className="w-full h-11 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-blue-600" />
            <span>{t('Sign in with Google', 'Google로 로그인')}</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Email not verified guard
  if (!firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 space-y-5 shadow-2xl">
          <div className="flex items-center gap-3 text-amber-400">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-bold text-white">
              {t('Email Verification Required', '이메일 인증 필요')}
            </h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {t(
              'Please use a verified Google email address to access Every Spec with J.',
              '이메일 인증이 완료된 Google 계정으로만 로그인할 수 있습니다.'
            )}
          </p>
          <button
            type="button"
            onClick={() => void logoutGoogle()}
            className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('Sign Out', '로그아웃')}</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Rejected Guard
  if (!isAdmin && userProfile?.status === 'rejected') {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-5 right-5">{renderLanguageToggle()}</div>

        <div className="w-full max-w-md bg-slate-900 border border-rose-900/60 rounded-2xl p-7 space-y-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-semibold text-rose-400 uppercase">
                Access Denied · Rejected
              </div>
              <h2 className="text-lg font-bold text-white">
                {t('Access Request Declined', '접근 권한이 거절되었습니다')}
              </h2>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-9 h-9 rounded-full object-cover border border-slate-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-200 font-bold flex items-center justify-center text-xs">
                {(userProfile.displayName || 'U').charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{userProfile.displayName}</div>
              <div className="text-[11px] text-slate-400 font-mono truncate">{userProfile.email}</div>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {t(
              'Your account access has been declined or revoked by an administrator. Contact your site administrator (toc80.lee@gmail.com) if you believe this is an error.',
              '관리자에 의해 접근 권한이 거절 또는 차단되었습니다. 접근이 필요한 경우 사이트 관리자(toc80.lee@gmail.com)에게 문의해 주세요.'
            )}
          </p>

          <button
            type="button"
            onClick={() => void logoutGoogle()}
            className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('Sign Out / Switch Account', '로그아웃 / 다른 계정으로 로그인')}</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Pending Approval Guard (Default state for newly registered Google users)
  if (!isApproved) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-5 right-5">{renderLanguageToggle()}</div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 space-y-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-semibold text-amber-400 uppercase">
                Pending Admin Approval
              </div>
              <h2 className="text-lg font-bold text-white">
                {t('Waiting for Approval', '관리자 승인 대기 중')}
              </h2>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {userProfile?.photoURL || firebaseUser.photoURL ? (
                <img
                  src={userProfile?.photoURL || firebaseUser.photoURL || ''}
                  alt={userProfile?.displayName || firebaseUser.displayName || 'User'}
                  className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  {(userProfile?.displayName || firebaseUser.displayName || 'U').charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {userProfile?.displayName || firebaseUser.displayName || 'SAP User'}
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {userProfile?.email || firebaseUser.email}
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[10px] font-bold shrink-0">
              {t('Pending', '승인 대기')}
            </span>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5">
            {t(
              'Your registration is complete. Please wait for an administrator to approve your account and assign your projects.',
              '가입 신청이 완료되었습니다. 관리자의 승인을 기다려주세요. 승인 및 프로젝트 할당이 완료되면 즉시 작업실로 입장됩니다.'
            )}
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="flex-1 h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${profileLoading ? 'animate-spin' : ''}`} />
              <span>{t('Check Status', '승인 상태 확인')}</span>
            </button>
            <button
              type="button"
              onClick={() => void logoutGoogle()}
              className="h-10 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('Sign Out', '로그아웃')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Approved Workspace
  return <WorkspaceErrorBoundary>{children}</WorkspaceErrorBoundary>;
};
