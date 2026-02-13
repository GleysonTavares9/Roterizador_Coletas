import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, Truck, User, Database, Calendar, DollarSign, ClipboardCheck, Route, LogOut, Settings, Menu, X, Activity, Users, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '@/services/supabase';
import { GlobalCallHandler } from './GlobalCallHandler';

export function Layout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [userName, setUserName] = useState('Usuário');
    const [userInitials, setUserInitials] = useState('U');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        loadUserProfile();
    }, []);

    const loadUserProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('full_name, avatar_url')
                    .eq('id', user.id)
                    .single();

                if (profile) {
                    if (profile.full_name) {
                        setUserName(profile.full_name);
                        const initials = profile.full_name
                            .split(' ')
                            .map((n: string) => n[0])
                            .join('')
                            .substring(0, 2)
                            .toUpperCase();
                        setUserInitials(initials);
                    }
                    if (profile.avatar_url) {
                        setAvatarUrl(profile.avatar_url);
                    }
                } else {
                    setUserName(user.email?.split('@')[0] || 'Usuário');
                    setUserInitials(user.email?.[0].toUpperCase() || 'U');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const navSections = [
        {
            title: 'Principal',
            items: [
                { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
                { name: 'Roteirização', icon: Route, path: '/roteirizacao' },
                { name: 'Monitoramento', icon: Activity, path: '/monitoring' },
                { name: 'Central de Mensagens', icon: MessageSquare, path: '/messages' },
                { name: 'Atribuições', icon: Users, path: '/assignments' },
                { name: 'Mapa', icon: Map, path: '/mapa' },
            ]
        },
        {
            title: 'Gestão',
            items: [
                { name: 'Calendário', icon: Calendar, path: '/calendario' },
                { name: 'Frota', icon: Truck, path: '/frota' },
                { name: 'Fechamento', icon: ClipboardCheck, path: '/fechamento-frota' },
                { name: 'Custos', icon: DollarSign, path: '/custos' },
                { name: 'Dados', icon: Database, path: '/dados' },
            ]
        },
        {
            title: 'Conta',
            items: [
                { name: 'Perfil', icon: User, path: '/perfil' },
                { name: 'Usuários', icon: Users, path: '/usuarios' },
            ]
        }
    ];

    return (
        <div className="flex min-h-screen bg-background text-foreground font-sans antialiased">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 overflow-hidden">
                            <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                        </div>
                        <span className="font-bold text-slate-800 text-lg tracking-tight">Sistema de Roteirização</span>
                    </div>
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 hover:bg-secondary/50 rounded-lg transition-colors"
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside className={cn(
                "fixed top-0 left-0 bottom-0 w-72 bg-card border-r border-border z-50 transform transition-transform duration-300 ease-in-out md:hidden flex flex-col",
                mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-6 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md border border-slate-200 mb-3 p-0 overflow-hidden">
                        <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-medium bg-slate-100 px-2 py-1 rounded-full">Sistema de Roteirização</p>
                </div>

                <nav className="flex-1 px-4 space-y-4 overflow-y-auto min-h-0">
                    {navSections.map((section) => (
                        <div key={section.title}>
                            <h3 className="px-4 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {section.title}
                            </h3>
                            <div className="space-y-1">
                                {section.items.map((item) => (
                                    <button
                                        key={item.name}
                                        onClick={() => {
                                            navigate(item.path);
                                            setMobileMenuOpen(false);
                                        }}
                                        className={cn(
                                            "flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative overflow-hidden",
                                            location.pathname === item.path
                                                ? "text-primary-foreground bg-primary shadow-lg shadow-primary/25"
                                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                                        )}
                                    >
                                        <item.icon className={cn("w-4 h-4 mr-3", location.pathname === item.path ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                                        {item.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-border bg-card mt-auto shrink-0">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-3 w-full hover:bg-secondary/50 p-2 rounded-lg transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs ring-2 ring-primary/20 overflow-hidden">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                userInitials
                            )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium truncate" title={userName}>{userName}</p>
                            <p className="text-xs text-muted-foreground">Admin</p>
                        </div>
                    </button>

                    {showUserMenu && (
                        <div className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2">
                            <button
                                onClick={() => {
                                    navigate('/perfil');
                                    setShowUserMenu(false);
                                    setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/50 transition-colors text-sm"
                            >
                                <Settings className="w-4 h-4" />
                                Configurações
                            </button>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-destructive/10 text-destructive transition-colors text-sm border-t border-border"
                            >
                                <LogOut className="w-4 h-4" />
                                Sair
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Desktop Sidebar */}
            <aside className="w-72 border-r border-border bg-card/50 backdrop-blur-xl hidden md:flex flex-col transition-all duration-300">
                <div className="p-6 pb-2 text-center">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg border border-slate-200 mb-4 mx-auto p-0 overflow-hidden">
                        <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5 mb-6 font-medium bg-slate-50 inline-block px-3 py-1 rounded-full border border-slate-100">Sistema de Roteirização</p>

                    {/* User Profile - Moved to Top */}
                    <div className="relative">
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-3 w-full hover:bg-secondary/50 p-2.5 rounded-xl transition-colors border border-transparent hover:border-border"
                        >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm ring-2 ring-primary/20 overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    userInitials
                                )}
                            </div>
                            <div className="flex-1 text-left overflow-hidden">
                                <p className="text-sm font-bold truncate">{userName}</p>
                                <p className="text-xs text-muted-foreground">Admin</p>
                            </div>
                        </button>

                        {showUserMenu && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                    onClick={() => {
                                        navigate('/perfil');
                                        setShowUserMenu(false);
                                    }}
                                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/50 transition-colors text-sm"
                                >
                                    <Settings className="w-4 h-4" />
                                    Configurações
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-destructive/10 text-destructive transition-colors text-sm border-t border-border"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sair
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="flex-1 px-5 space-y-8 overflow-y-auto py-4">
                    {navSections.map((section) => (
                        <div key={section.title}>
                            <h3 className="px-4 mb-3 text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-80">
                                {section.title}
                            </h3>
                            <div className="space-y-1.5">
                                {section.items.map((item) => (
                                    <button
                                        key={item.name}
                                        onClick={() => navigate(item.path)}
                                        className={cn(
                                            "flex items-center w-full px-5 py-3.5 text-base font-medium rounded-xl transition-all duration-200 group relative overflow-hidden",
                                            location.pathname === item.path
                                                ? "text-primary-foreground bg-primary shadow-lg shadow-primary/25 translate-x-1"
                                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:translate-x-1"
                                        )}
                                    >
                                        <item.icon className={cn("w-6 h-6 mr-3.5", location.pathname === item.path ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                                        {item.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto pt-16 md:pt-0 flex flex-col min-h-screen">
                <div className="p-3 sm:p-4 md:p-6 lg:p-8 w-full max-w-[98%] mx-auto flex-1">
                    {children}
                </div>

                {/* System Footer */}
                <footer className="py-8 px-8 border-t border-border bg-white mt-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-slate-500 font-medium text-center md:text-left">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-sm">
                                    <img src="/assets/app-logo.png" alt="Logo" className="w-full h-full object-cover" />
                                </div>
                                <span className="font-bold text-slate-700 text-base">Sistema de Roteirização</span>
                            </div>
                            <span className="hidden sm:inline text-slate-300">|</span>
                            <span>© 2025 Todos os direitos reservados.</span>
                        </div>
                        <div className="flex items-center gap-8">
                            <button
                                onClick={() => navigate('/support')}
                                className="hover:text-primary cursor-pointer transition-colors hover:underline"
                            >
                                Suporte
                            </button>
                            <button
                                onClick={() => navigate('/privacy')}
                                className="hover:text-primary cursor-pointer transition-colors hover:underline"
                            >
                                Política de Privacidade
                            </button>
                            <button
                                onClick={() => navigate('/terms')}
                                className="hover:text-primary cursor-pointer transition-colors hover:underline"
                            >
                                Termos de Uso
                            </button>
                            <span className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold ring-1 ring-primary/20">v2.4.0</span>
                        </div>
                    </div>
                </footer>
            </main>

            {/* Global Voice Call Handler (Admin Receiver) */}
            <GlobalCallHandler />
        </div>
    );
}
