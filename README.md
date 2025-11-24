# 1111 School - AI-Powered Personalized Learning

An intelligent, adaptive learning platform that creates personalized courses based on your interests and learning style. Built with React, TypeScript, and Google's Gemini AI.

## 🌟 Features

### Personalized Course Generation
- **Conversational Setup**: Start by chatting with the AI about what you want to learn
- **Dynamic Course Creation**: After a brief conversation, the AI generates a complete, customized curriculum tailored to your needs
- **Adaptive Lessons**: Each lesson adapts based on your comprehension and progress

### Interactive Learning Experience
- **AI-Generated Visuals**: Lessons include custom-generated images to enhance understanding
- **Comprehension Assessments**: Interactive activities test your understanding after each lesson
- **Remedial Support**: Struggling with a concept? The AI generates additional practice activities with extra support
- **Progress Tracking**: Monitor your learning journey across multiple courses

### Beautiful, Modern UI
- **Glassmorphism Design**: Sleek, modern interface with smooth animations
- **Dark Mode**: Easy on the eyes for extended learning sessions
- **Responsive Layout**: Works seamlessly on desktop and mobile devices
- **Framer Motion Animations**: Smooth, engaging transitions throughout the app

## 🚀 Live Demo

Visit the live application: [https://1111philo.github.io/school/](https://1111philo.github.io/school/)

## 🛠️ Technology Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI + Shadcn/ui
- **Animations**: Framer Motion
- **State Management**: Zustand with persistence
- **AI Integration**: Google Gemini API (Flash & Pro models)
- **Deployment**: GitHub Pages with automated CI/CD

## 📋 Prerequisites

- Node.js 20 or higher
- npm or yarn
- A Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))

## 🏃 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/1111philo/school.git
cd school
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the development server
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Configure the app
On first launch, you'll be prompted to:
- Enter your Google Gemini API key
- Provide your name for personalization

Your settings are stored locally in your browser.

## 🎓 How to Use

1. **Start a New Course**
   - Click "New Course" to begin
   - Chat with the AI about what you want to learn
   - After 2+ messages, click "Generate Course" to create your personalized curriculum

2. **Learn Through Lessons**
   - Each lesson includes content, visual explanations, and comprehension checks
   - Complete activities to test your understanding
   - Get immediate feedback on your performance

3. **Adaptive Learning**
   - Score below 70%? The AI generates remedial activities with additional support
   - Score 70% or above? Move on to the next lesson
   - The AI adapts future lessons based on your performance

4. **Track Your Progress**
   - View all your courses from the Courses page
   - Resume where you left off
   - Monitor completion percentages

## 🔧 Building for Production

```bash
npm run build
```

The production build will be created in the `dist` directory.

## 🚢 Deployment

This project is configured for automatic deployment to GitHub Pages:

1. **Automatic Deployment**: Every push to the `main` branch triggers an automatic build and deployment
2. **GitHub Actions**: The workflow is defined in `.github/workflows/deploy.yml`
3. **Live URL**: Your app will be available at `https://[username].github.io/school/`

### Manual Deployment Setup

If you fork this repository:

1. Push your changes to the `main` branch
2. Go to your repository Settings → Pages
3. Under "Build and deployment", select `gh-pages` as the branch
4. Save and wait a few minutes for deployment

## 📁 Project Structure

```
school/
├── src/
│   ├── components/       # React components
│   │   ├── Layout.tsx   # Main app layout
│   │   ├── ChatView.tsx # Conversation interface
│   │   ├── CourseView.tsx # Learning interface
│   │   └── ...
│   ├── services/        # AI and API services
│   │   ├── GenAIService.ts # Gemini API integration
│   │   └── visualGenerator.ts # Image generation
│   ├── store/           # State management
│   │   └── useAppStore.ts # Zustand store
│   ├── types/           # TypeScript definitions
│   └── App.tsx          # Main app component
├── .github/
│   └── workflows/
│       └── deploy.yml   # GitHub Actions deployment
└── package.json
```

## 🔑 Environment Variables

The app uses browser-based storage for the API key. No `.env` file is needed. Users enter their API key through the Settings interface.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with [Google Gemini AI](https://ai.google.dev/)
- UI components from [Shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

## 📞 Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check the AI reasoning logs in the app's Log section for debugging

---

**Made with ❤️ by the 1111 Philosopher's Group**
