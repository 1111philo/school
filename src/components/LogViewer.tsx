import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { FileText, Download } from "lucide-react";

export function LogViewer() {
    const logs = useAppStore((state) => state.logs);

    // Sort logs newest to oldest
    const sortedLogs = [...logs].reverse();

    const downloadText = (filename: string, text: string) => {
        const element = document.createElement("a");
        const file = new Blob([text], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="fixed bottom-4 right-4 z-50 bg-background/50 backdrop-blur-sm">
                    <FileText className="h-4 w-4" />
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle>GenAI Reasoning Logs</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
                    <div className="space-y-4">
                        {sortedLogs.map((log) => (
                            <div key={log.id} className="p-4 rounded-lg border bg-muted/50">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-semibold text-sm">{log.action}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground mb-3">{log.reasoning}</p>
                                {log.usage && (
                                    <div className="flex gap-3 mb-3 text-[10px] font-mono text-muted-foreground bg-muted/30 p-1.5 rounded">
                                        <span>Prompt: {log.usage.promptTokens}</span>
                                        <span>Output: {log.usage.candidatesTokens}</span>
                                        <span className="font-bold text-primary">Total: {log.usage.totalTokens}</span>
                                    </div>
                                )}
                                {(log.prompt || log.response) && (
                                    <div className="flex gap-2 mt-2">
                                        {log.prompt && (
                                            <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => downloadText(`prompt-${log.action.toLowerCase().replace(/\s+/g, '-')}-${log.timestamp}.txt`, log.prompt!)}>
                                                <Download className="w-3 h-3 mr-1" />
                                                Prompt
                                            </Button>
                                        )}
                                        {log.response && (
                                            <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => downloadText(`response-${log.action.toLowerCase().replace(/\s+/g, '-')}-${log.timestamp}.json`, log.response!)}>
                                                <Download className="w-3 h-3 mr-1" />
                                                Response
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {logs.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">No logs yet.</p>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
