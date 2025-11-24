import { Layout } from './components/Layout';
import { ChatView } from './components/ChatView';
import { CoursesView } from './components/CoursesView';
import { CourseView } from './components/CourseView';
import { SettingsView } from './components/SettingsView';
import { useAppStore } from './store/useAppStore';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

function App() {
  const { appState, settings } = useAppStore();

  // Initialize chat if no API key is set
  useEffect(() => {
    if (!settings.apiKey || !settings.userName) {
      useAppStore.getState().setAppState('SETTINGS');
    }
  }, [settings.apiKey, settings.userName]);

  const renderContent = () => {
    // Force settings if no API key
    if (!settings.apiKey || !settings.userName) {
      return <SettingsView />;
    }

    switch (appState) {
      case 'CHAT':
        return <ChatView />;
      case 'COURSE_GENERATION':
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full"
            />
            <p className="text-xl font-medium text-muted-foreground animate-pulse">
              Designing your personalized curriculum...
            </p>
          </div>
        );
      case 'LEARNING':
        return <CourseView />;
      case 'SETTINGS':
        return <SettingsView />;
      case 'COURSES':
      default:
        return <CoursesView />;
    }
  };

  return (
    <Layout>
      {renderContent()}
    </Layout>
  );
}

export default App;
