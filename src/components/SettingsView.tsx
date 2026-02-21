import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function SettingsView() {
    const { settings, updateSettings, setAppState } = useAppStore();
    const [apiKey, setApiKey] = useState(settings.apiKey);
    const [userName, setUserName] = useState(settings.userName);

    const handleSave = () => {
        const trimmedApiKey = apiKey.trim();
        const trimmedUserName = userName.trim();
        updateSettings({ apiKey: trimmedApiKey, userName: trimmedUserName });
        if (trimmedApiKey && trimmedUserName) {
            setAppState('COURSES');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-140px)]">
            <Card className="w-full max-w-md bg-card border-2 shadow-xl">
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                    <CardDescription>
                        Configure your learning experience. You need a Google Gemini API key to proceed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="apiKey">Gemini API Key</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                        />
                        <p className="text-xs text-muted-foreground">
                            Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-primary">Google AI Studio</a>.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="userName">Your Name</Label>
                        <Input
                            id="userName"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Alice"
                        />
                    </div>
                    <div className="flex gap-2">
                        {settings.apiKey && (
                            <Button variant="outline" onClick={() => setAppState('COURSES')} className="flex-1">
                                Cancel
                            </Button>
                        )}
                        <Button onClick={handleSave} className="flex-1" disabled={!apiKey || !userName}>
                            Save Settings
                        </Button>
                    </div>
                    <div className="pt-6 border-t">
                        <h3 className="text-sm font-medium text-destructive mb-2">Danger Zone</h3>
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => {
                                if (window.confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
                                    useAppStore.getState().clearAllData();
                                }
                            }}
                        >
                            Reset All Data
                        </Button>
                    </div>
                </CardContent >
            </Card >
        </div >
    );
}
