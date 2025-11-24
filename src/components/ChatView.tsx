import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';

export function ChatView() {
    const { activeChatSession, sendMessage, generateCourse, isGenerating } = useAppStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeChatSession?.messages]);

    const handleSend = async () => {
        if (!input.trim() || isGenerating) return;
        const message = input.trim();
        setInput('');
        await sendMessage(message);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const canGenerateCourse = (activeChatSession?.messages.length || 0) >= 4;

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4">
                <AnimatePresence mode="popLayout">
                    {activeChatSession?.messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                    ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
                                    : 'bg-muted/50 backdrop-blur-sm border border-border/40'
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isGenerating && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                    >
                        <div className="bg-muted/50 backdrop-blur-sm border border-border/40 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <motion.div
                                        className="w-2 h-2 bg-primary rounded-full"
                                        animate={{ y: [0, -8, 0] }}
                                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                                    />
                                    <motion.div
                                        className="w-2 h-2 bg-primary rounded-full"
                                        animate={{ y: [0, -8, 0] }}
                                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                                    />
                                    <motion.div
                                        className="w-2 h-2 bg-primary rounded-full"
                                        animate={{ y: [0, -8, 0] }}
                                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                                    />
                                </div>
                                <span className="text-sm text-muted-foreground">Thinking...</span>
                            </div>
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-border/40 bg-background/50 backdrop-blur-sm p-4">
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        disabled={isGenerating}
                        className="flex-1"
                    />
                    <Button onClick={handleSend} disabled={!input.trim() || isGenerating} size="icon">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Floating Generate Course Button */}
            {canGenerateCourse && (
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="fixed bottom-24 right-8"
                >
                    <Button
                        onClick={generateCourse}
                        disabled={isGenerating}
                        size="lg"
                        className="rounded-full shadow-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    >
                        <Sparkles className="w-5 h-5 mr-2" />
                        Generate Course
                    </Button>
                </motion.div>
            )}
        </div>
    );
}
