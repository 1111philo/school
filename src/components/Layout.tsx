import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { LogViewer } from './LogViewer';
import { BookOpen, Settings } from 'lucide-react';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    const { appState, setAppState } = useAppStore();

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
            <div className="relative z-10 min-h-screen flex flex-col">
                <header className="p-4 flex justify-between items-center border-b border-border/40 backdrop-blur-sm bg-background/50 sticky top-0 z-40">
                    <button
                        onClick={() => setAppState('COURSES')}
                        className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 hover:opacity-80 transition-opacity"
                    >
                        1111 School
                    </button>
                    <nav className="flex items-center gap-1">
                        <Button
                            variant={appState === 'COURSES' || appState === 'LEARNING' || appState === 'COURSE_GENERATION' ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setAppState('COURSES')}
                            className={appState === 'COURSES' || appState === 'LEARNING' || appState === 'COURSE_GENERATION' ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                        >
                            <BookOpen className="w-4 h-4 mr-2" />
                            Courses
                        </Button>
                        <Button
                            variant={appState === 'SETTINGS' ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setAppState('SETTINGS')}
                            className={appState === 'SETTINGS' ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                        </Button>
                    </nav>
                </header>
                <main className="flex-1 flex flex-col relative overflow-hidden">
                    {children}
                </main>
                {/* LogViewer with fixed positioning - render outside header */}
                <LogViewer />
            </div>
        </div>
    );
}
