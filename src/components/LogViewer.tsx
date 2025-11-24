import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { FileText } from "lucide-react";

export function LogViewer() {
    const logs = useAppStore((state) => state.logs);

    // Sort logs newest to oldest
    const sortedLogs = [...logs].reverse();

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
                                <p className="text-sm text-muted-foreground">{log.reasoning}</p>
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
