import { motion } from 'framer-motion';

export function CourseGenerationView() {
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
}
