import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { LogViewer } from './LogViewer';
import { BookOpen, Settings, MessageSquarePlus } from 'lucide-react';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    const { appState, setAppState, startNewChat } = useAppStore();

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
            <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
            <div className="relative z-10 min-h-screen flex flex-col">
                <header className="p-4 flex justify-between items-center border-b border-border/40 backdrop-blur-sm bg-background/50 sticky top-0 z-40">
                    <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        1111 School
                    </h1>
                    <div className="flex items-center gap-2">
                        {appState !== 'COURSES' && (
                            <Button variant="ghost" size="sm" onClick={() => setAppState('COURSES')}>
                                <BookOpen className="w-4 h-4 mr-2" />
                                Courses
                            </Button>
                        )}
                        {appState !== 'CHAT' && (
                            <Button variant="ghost" size="sm" onClick={startNewChat}>
                                <MessageSquarePlus className="w-4 h-4 mr-2" />
                                New Chat
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setAppState('SETTINGS')}>
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                        </Button>
                        <LogViewer />
                    </div>
                </header>
                <main className="flex-1 container mx-auto p-4 md:p-8 max-w-7xl">
                    {children}
                </main>
            </div>
        </div>
    );
}
