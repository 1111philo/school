import { Layout } from './components/Layout';
import { CoursesView } from './components/CoursesView';
import { CourseView } from './components/CourseView';
import { CourseGenerationView } from './components/CourseGenerationView';
import { SettingsView } from './components/SettingsView';
import { useAppStore } from './store/useAppStore';
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
      case 'COURSE_GENERATION':
        return <CourseGenerationView />;
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
